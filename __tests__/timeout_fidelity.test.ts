export {};
const { EdgeRunner } = require('../src/edgeRunner');
const { AWS_LIMITS } = require('../src/constants');
const { startServer } = require('../src/index');
const http = require('http');
const fs = require('fs');
const path = require('path');

describe('Execution Timeout Fidelity', () => {
    const tmpDir = path.join(__dirname, '.tmp/', 'timeout_test');
    const port = 3008;
    jest.setTimeout(30000);

    beforeAll(() => {
        if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
        fs.mkdirSync(tmpDir, { recursive: true });
    });

    afterAll(() => {
        if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('Viewer Hook: Should timeout after 5s in strict mode', async () => {
        const testDir = path.join(tmpDir, 'strict_timeout');
        fs.mkdirSync(testDir, { recursive: true });
        fs.writeFileSync(path.join(testDir, 'handler.js'), `
            exports.hookType = 'viewer-request';
            exports.handler = async (event, context) => {
                await new Promise(resolve => setTimeout(resolve, 6000));
                return event.Records[0].cf.request;
            };
        `);

        const runner = new EdgeRunner(testDir, { strict: true, watch: false });
        runner.load();
        const { result } = await runner.runRequestHook({ url: '/' });
        expect(result._timeout).toBe(true);
        runner.close();
    }, 30000);

    test('Origin Hook: Should NOT timeout at 6s (Limit is 30s)', async () => {
        const testDir = path.join(tmpDir, 'origin_ok');
        fs.mkdirSync(testDir, { recursive: true });
        fs.writeFileSync(path.join(testDir, 'handler.js'), `
            exports.hookType = 'origin-request';
            exports.handler = async (event) => {
                await new Promise(resolve => setTimeout(resolve, 6000));
                return event.Records[0].cf.request;
            };
        `);

        const runner = new EdgeRunner(testDir, { strict: true, watch: false });
        runner.load();
        const { result } = await runner.runRequestHook({ url: '/' });
        
        expect(result).not.toBeNull();
        expect(result.uri).toBe('/');
        runner.close();
    }, 30000);

    test('Default Mode: Should log warning but allow completion after timeout', async () => {
        const testDir = path.join(tmpDir, 'viewer_warn');
        fs.mkdirSync(testDir, { recursive: true });
        fs.writeFileSync(path.join(testDir, 'handler.js'), `
            exports.hookType = 'viewer-request';
            exports.handler = async (event) => {
                await new Promise(resolve => setTimeout(resolve, 5500));
                const req = event.Records[0].cf.request;
                req.uri = '/finished';
                return req;
            };
        `);

        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const runner = new EdgeRunner(testDir, { strict: false, watch: false });
        runner.load();
        
        const { result } = await runner.runRequestHook({ url: '/' });
        
        expect(result.uri).toBe('/finished');
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Fidelity Warning: Handler took'));
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('exceeding the AWS 5s limit'));
        
        warnSpy.mockRestore();
        runner.close();
    }, 30000);

    test('Context: getRemainingTimeInMillis() should decrease', async () => {
        const testDir = path.join(tmpDir, 'remaining_time');
        fs.mkdirSync(testDir, { recursive: true });
        fs.writeFileSync(path.join(testDir, 'handler.js'), `
            exports.hookType = 'viewer-request';
            exports.handler = async (event, context) => {
                const t1 = context.getRemainingTimeInMillis();
                await new Promise(resolve => setTimeout(resolve, 1000));
                const t2 = context.getRemainingTimeInMillis();
                return { 
                    status: '200',
                    headers: { 'x-times': [{ key: 'x-times', value: t1 + ',' + t2 }] },
                    body: 'ok'
                };
            };
        `);

        const runner = new EdgeRunner(testDir, { watch: false });
        runner.load();
        const { result } = await runner.runRequestHook({ url: '/' });
        
        const [t1, t2] = result.headers['x-times'][0].value.split(',').map(Number);
        expect(t1).toBeGreaterThan(4500);
        expect(t1).toBeLessThanOrEqual(5000);
        expect(t2).toBeLessThan(t1 - 900);
        runner.close();
    }, 30000);

    // End-to-end: strict mode must surface a timeout as AWS does (503), not pass the request through
    const runStrictServer = async (hookType: string) => {
        const testDir = path.join(tmpDir, `e2e_${hookType}`);
        const hookDir = path.join(testDir, 'hooks');
        fs.mkdirSync(hookDir, { recursive: true });
        fs.writeFileSync(path.join(testDir, 'index.html'), 'origin-ok');
        fs.writeFileSync(path.join(hookDir, 'handler.js'), `
            exports.hookType = '${hookType}';
            exports.handler = async (event) => {
                await new Promise(resolve => setTimeout(resolve, 6000));
                const cf = event.Records[0].cf;
                return cf.response || cf.request;
            };
        `);

        const runner = new EdgeRunner(hookDir, { strict: true, watch: false });
        runner.load();
        const server = startServer({ port: 0, directory: testDir, edgeRunner: runner, noBanner: true, strict: true });
        await new Promise(resolve => server.listening ? resolve(null) : server.once('listening', resolve));

        const { statusCode, body } = await new Promise<any>((resolve, reject) => {
            http.get(`http://127.0.0.1:${server.address().port}/index.html`, (res: any) => {
                let data = '';
                res.on('data', (c: any) => data += c);
                res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
            }).on('error', reject);
        });

        await server.closeGracefully();
        return { statusCode, body };
    };

    test('Strict E2E: viewer-request timeout returns 503', async () => {
        const { statusCode, body } = await runStrictServer('viewer-request');
        expect(statusCode).toBe(503);
        expect(body).toContain('LambdaLimitExceeded');
    }, 30000);

    test('Strict E2E: viewer-response timeout returns 503 instead of the origin response', async () => {
        const { statusCode, body } = await runStrictServer('viewer-response');
        expect(statusCode).toBe(503);
        expect(body).toContain('LambdaLimitExceeded');
        expect(body).not.toContain('origin-ok');
    }, 30000);
});
