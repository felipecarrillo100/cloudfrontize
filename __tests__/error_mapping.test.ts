export {};
const request = require('supertest');
const { startServer } = require('../src/index');
const { EdgeRunner } = require('../src/edgeRunner');
const { CFFRunner } = require('../src/CFFRunner');
const fs = require('fs');
const path = require('path');

// AWS Parity: function validation errors → 502, execution errors → 503
describe('Hook Error → Status Mapping', () => {
    const tmpDir = path.join(__dirname, '.tmp/', 'error_mapping');
    const servers: any[] = [];

    const serveEdge = async (name: string, code: string, opts: any = {}) => {
        const dir = path.join(tmpDir, name);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'hook.js'), code);
        const runner = new EdgeRunner(dir, { watch: false, ...opts });
        runner.load();
        const server = startServer({ port: 0, directory: tmpDir, edgeRunner: runner, noBanner: true, ...opts });
        await server.ready;
        servers.push(server);
        return server;
    };

    beforeAll(() => {
        if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
        fs.mkdirSync(tmpDir, { recursive: true });
        fs.writeFileSync(path.join(tmpDir, 'index.html'), 'origin-ok');
        jest.spyOn(console, 'error').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(async () => {
        while (servers.length) await servers.pop().closeGracefully();
    });

    afterAll(() => {
        jest.restoreAllMocks();
        if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('a throwing L@E handler returns 503 LambdaExecutionError', async () => {
        const server = await serveEdge('throws', `
            exports.hookType = 'viewer-request';
            exports.handler = async () => { throw new Error('boom <&>'); };
        `);
        const res = await request(server).get('/index.html');
        expect(res.status).toBe(503);
        expect(res.text).toContain('<Code>LambdaExecutionError</Code>');
        expect(res.text).toContain('boom &#60;&#38;&#62;');
    });

    test('a callback error from an origin-response handler returns 503', async () => {
        const server = await serveEdge('cb_error', `
            exports.hookType = 'origin-response';
            exports.handler = (event, context, callback) => callback(new Error('cb-failure'));
        `);
        const res = await request(server).get('/index.html');
        expect(res.status).toBe(503);
        expect(res.text).toContain('cb-failure');
        expect(res.text).not.toContain('origin-ok');
    });

    test('a strict forbidden header mutation stays a 502 validation error', async () => {
        const server = await serveEdge('forbidden', `
            exports.hookType = 'viewer-request';
            exports.handler = async (event) => {
                const req = event.Records[0].cf.request;
                req.headers['host'] = [{ key: 'Host', value: 'evil.example' }];
                return req;
            };
        `, { strict: true });
        const res = await request(server).get('/index.html');
        expect(res.status).toBe(502);
        expect(res.text).toContain('<Code>LambdaValidationError</Code>');
        expect(res.text).toContain('Forbidden Header Mutation');
    });

    test('a throwing CloudFront Function in strict mode returns 503 FunctionExecutionError', async () => {
        const cffDir = path.join(tmpDir, 'cff_throws');
        fs.mkdirSync(cffDir, { recursive: true });
        fs.writeFileSync(path.join(cffDir, 'viewer-request-throws.js'), `
            function handler(event) { throw new Error('cff-boom'); }
        `);
        const cffRunner = new CFFRunner(cffDir, { strict: true });
        cffRunner.load();
        const server = startServer({ port: 0, directory: tmpDir, cffRunner, noBanner: true, strict: true });
        await server.ready;
        servers.push(server);

        const res = await request(server).get('/index.html');
        expect(res.status).toBe(503);
        expect(res.text).toContain('<Code>FunctionExecutionError</Code>');
        expect(res.text).toContain('cff-boom');
    });
});
