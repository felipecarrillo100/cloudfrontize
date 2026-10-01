export {};
const request = require('supertest');
const { startServer } = require('../src/index');
const { EdgeRunner } = require('../src/edgeRunner');
const { CFFRunner } = require('../src/CFFRunner');
const { AWS_LIMITS } = require('../src/constants');
const fs = require('fs');
const path = require('path');

describe('Runaway Hook Protection', () => {
    const tmpDir = path.join(__dirname, '.tmp/', 'runaway_code');
    const servers: any[] = [];

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

    test('non-strict: an L@E handler that never settles fails with 503 at the enforced guard', async () => {
        const saved = { ...AWS_LIMITS };
        AWS_LIMITS.VIEWER_TIMEOUT_MS = 200;       // keep the test fast: AWS reference limit (warns)
        AWS_LIMITS.VIEWER_TIMEOUT_GUARD_MS = 400; // enforced guard with leeway (stops runaways)
        try {
            const dir = path.join(tmpDir, 'never_settles');
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, 'hook.js'), `
                exports.hookType = 'viewer-request';
                exports.handler = () => new Promise(() => {});
            `);
            const runner = new EdgeRunner(dir, { watch: false });
            runner.load();
            const server = startServer({ port: 0, directory: tmpDir, edgeRunner: runner, noBanner: true });
            await server.ready;
            servers.push(server);

            const started = Date.now();
            const res = await request(server).get('/index.html');
            expect(res.status).toBe(503);
            expect(res.text).toContain('LambdaLimitExceeded');
            expect(Date.now() - started).toBeGreaterThanOrEqual(400);
        } finally {
            Object.assign(AWS_LIMITS, saved);
        }
    });

    test('non-strict: a handler returning null still passes through (not treated as a timeout)', async () => {
        const dir = path.join(tmpDir, 'returns_null');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'hook.js'), `
            exports.hookType = 'viewer-request';
            exports.handler = (event, context, callback) => callback(null, null);
        `);
        const runner = new EdgeRunner(dir, { watch: false });
        runner.load();
        const server = startServer({ port: 0, directory: tmpDir, edgeRunner: runner, noBanner: true });
        await server.ready;
        servers.push(server);

        const res = await request(server).get('/index.html');
        expect(res.status).toBe(200);
        expect(res.text).toBe('origin-ok');
    });

    const loopingCff = (name: string) => {
        const dir = path.join(tmpDir, name);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'viewer-request-loop.js'), `
            function handler(event) { while (true) {} }
        `);
        return dir;
    };

    test('non-strict: an infinitely looping CloudFront Function is stopped (503) without freezing load', async () => {
        const started = Date.now();
        const cffRunner = new CFFRunner(loopingCff('cff_loop'), {});
        cffRunner.load();
        // Warmup stops at the first failure, so load costs a single guard period
        expect(Date.now() - started).toBeLessThan(3000);

        const server = startServer({ port: 0, directory: tmpDir, cffRunner, noBanner: true });
        await server.ready;
        servers.push(server);
        const res = await request(server).get('/index.html');
        // Runaway code is stopped in every mode
        expect(res.status).toBe(503);
        expect(res.text).toContain('FunctionExecutionError');
    });

    test('strict: an infinitely looping CloudFront Function returns 503', async () => {
        const cffRunner = new CFFRunner(loopingCff('cff_loop_strict'), { strict: true });
        cffRunner.load();
        const server = startServer({ port: 0, directory: tmpDir, cffRunner, noBanner: true, strict: true });
        await server.ready;
        servers.push(server);

        const res = await request(server).get('/index.html');
        expect(res.status).toBe(503);
        expect(res.text).toContain('FunctionExecutionError');
    });
});
