export {};
const { EdgeRunner } = require('../src/edgeRunner');
const { AWS_LIMITS } = require('../src/constants');
const { startServer } = require('../src/index');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Timing model: the AWS timeout (30s, "Quotas on Lambda@Edge") is a reference limit that only warns,
// in every mode, because local hardware isn't AWS hardware. An enforced guard with leeway stops
// runaway code (a handler that never settles) with 503 LambdaLimitExceeded.
describe('Execution Timeout Fidelity', () => {
    const tmpDir = path.join(__dirname, '.tmp/', 'timeout_test');
    jest.setTimeout(30000);

    // Shrink the limits so the suite stays fast; the logic is identical at the real values
    const withLimits = async (limitMs: number, guardMs: number, fn: () => Promise<void>) => {
        const saved = { ...AWS_LIMITS };
        AWS_LIMITS.VIEWER_TIMEOUT_MS = limitMs;
        AWS_LIMITS.ORIGIN_TIMEOUT_MS = limitMs;
        AWS_LIMITS.VIEWER_TIMEOUT_GUARD_MS = guardMs;
        AWS_LIMITS.ORIGIN_TIMEOUT_GUARD_MS = guardMs;
        try {
            await fn();
        } finally {
            Object.assign(AWS_LIMITS, saved);
        }
    };

    const writeHook = (name: string, code: string) => {
        const dir = path.join(tmpDir, name);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'handler.js'), code);
        return dir;
    };

    beforeAll(() => {
        if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
        fs.mkdirSync(tmpDir, { recursive: true });
    });

    afterAll(() => {
        if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('Limits match the AWS docs: 30s for every event, enforced guard above it', () => {
        const actual = require('../src/constants').AWS_LIMITS;
        expect(actual.VIEWER_TIMEOUT_MS).toBe(30000);
        expect(actual.ORIGIN_TIMEOUT_MS).toBe(30000);
        expect(actual.VIEWER_TIMEOUT_GUARD_MS).toBeGreaterThan(actual.VIEWER_TIMEOUT_MS);
        expect(actual.ORIGIN_TIMEOUT_GUARD_MS).toBeGreaterThan(actual.ORIGIN_TIMEOUT_MS);
    });

    test.each([['strict', true], ['default', false]])(
        '%s mode: a handler slower than the AWS limit warns but completes',
        async (_mode, strict) => {
            await withLimits(200, 2000, async () => {
                const dir = writeHook(`slow_${_mode}`, `
                    exports.hookType = 'viewer-request';
                    exports.handler = async (event) => {
                        await new Promise(resolve => setTimeout(resolve, 400));
                        const req = event.Records[0].cf.request;
                        req.uri = '/finished';
                        return req;
                    };
                `);
                const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
                const runner = new EdgeRunner(dir, { strict, watch: false });
                runner.load();

                const { result } = await runner.runRequestHook({ url: '/' });

                expect(result._timeout).toBeUndefined();
                expect(result.uri).toBe('/finished');
                expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Fidelity Warning: Handler took'));
                expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('exceeding the AWS 0.2s limit'));
                warnSpy.mockRestore();
                runner.close();
            });
        }
    );

    test('A handler that never settles is stopped at the enforced guard', async () => {
        await withLimits(100, 300, async () => {
            const dir = writeHook('never_settles', `
                exports.hookType = 'origin-request';
                exports.handler = () => new Promise(() => {});
            `);
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
            const runner = new EdgeRunner(dir, { strict: true, watch: false });
            runner.load();

            const started = Date.now();
            const { result } = await runner.runRequestHook({ url: '/' });

            expect(result._timeout).toBe(true);
            expect(result.status).toBe('503');
            expect(Date.now() - started).toBeGreaterThanOrEqual(290);
            warnSpy.mockRestore();
            runner.close();
        });
    });

    test('Context: getRemainingTimeInMillis() counts down from the 30s AWS limit', async () => {
        const dir = writeHook('remaining_time', `
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
        const runner = new EdgeRunner(dir, { watch: false });
        runner.load();
        const { result } = await runner.runRequestHook({ url: '/' });

        const [t1, t2] = result.headers['x-times'][0].value.split(',').map(Number);
        expect(t1).toBeGreaterThan(29500);
        expect(t1).toBeLessThanOrEqual(30000);
        expect(t2).toBeLessThan(t1 - 900);
        runner.close();
    });

    // End-to-end: a runaway hook surfaces as AWS does (503), not as a pass-through or a hang
    const runStrictServer = async (hookType: string) => {
        const testDir = path.join(tmpDir, `e2e_${hookType}`);
        const hookDir = path.join(testDir, 'hooks');
        fs.mkdirSync(hookDir, { recursive: true });
        fs.writeFileSync(path.join(testDir, 'index.html'), 'origin-ok');
        fs.writeFileSync(path.join(hookDir, 'handler.js'), `
            exports.hookType = '${hookType}';
            exports.handler = () => new Promise(() => {});
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

    test('E2E: a runaway viewer-request hook returns 503', async () => {
        await withLimits(100, 300, async () => {
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
            const { statusCode, body } = await runStrictServer('viewer-request');
            expect(statusCode).toBe(503);
            expect(body).toContain('LambdaLimitExceeded');
            warnSpy.mockRestore();
        });
    });

    test('E2E: a runaway viewer-response hook returns 503 instead of the origin response', async () => {
        await withLimits(100, 300, async () => {
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
            const { statusCode, body } = await runStrictServer('viewer-response');
            expect(statusCode).toBe(503);
            expect(body).toContain('LambdaLimitExceeded');
            expect(body).not.toContain('origin-ok');
            warnSpy.mockRestore();
        });
    });
});
