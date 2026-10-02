export {};
const request = require('supertest');
const { startServer } = require('../src/index');
const { EdgeRunner } = require('../src/edgeRunner');
const { CFFRunner } = require('../src/CFFRunner');
const fs = require('fs');
const path = require('path');

// Each test cites the AWS CloudFront Developer Guide rule it verifies
// ("Restrictions on all edge functions", "Restrictions on Lambda@Edge", "Quotas").
describe('AWS Edge Function Restrictions', () => {
    const tmpDir = path.join(__dirname, '.tmp/', 'aws_restrictions');
    const servers: any[] = [];
    let seq = 0;

    const edgeRunner = (files: Record<string, string>, opts: any = {}) => {
        const dir = path.join(tmpDir, `edge_${seq++}`);
        fs.mkdirSync(dir, { recursive: true });
        for (const [name, code] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), code);
        const runner = new EdgeRunner(dir, { watch: false, ...opts });
        runner.load();
        return runner;
    };

    const cffRunner = (files: Record<string, string>, opts: any = {}) => {
        const dir = path.join(tmpDir, `cff_${seq++}`);
        fs.mkdirSync(dir, { recursive: true });
        for (const [name, code] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), code);
        const runner = new CFFRunner(dir, opts);
        runner.load();
        return runner;
    };

    const serve = async (opts: any) => {
        const server = startServer({ port: 0, directory: path.join(tmpDir, 'www'), noBanner: true, ...opts });
        await server.ready;
        servers.push(server);
        return server;
    };

    beforeAll(() => {
        if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
        fs.mkdirSync(path.join(tmpDir, 'www', 'api'), { recursive: true });
        fs.writeFileSync(path.join(tmpDir, 'www', 'index.html'), 'origin-ok');
        fs.writeFileSync(path.join(tmpDir, 'www', 'api', 'data.json'), '{"from":"local"}');
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(async () => {
        while (servers.length) await servers.pop().closeGracefully();
    });

    afterAll(() => {
        jest.restoreAllMocks();
        if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    describe('Headers', () => {
        test('disallowed headers are not exposed to functions', async () => {
            const runner = edgeRunner({ 'echo.js': `
                exports.hookType = 'viewer-request';
                exports.handler = async (event) => ({
                    status: '200', headers: {},
                    body: JSON.stringify(Object.keys(event.Records[0].cf.request.headers))
                });
            ` });
            const res = await request(await serve({ edgeRunner: runner }))
                .get('/').set('X-Forwarded-Proto', 'https').set('X-Edge-Location', 'test').set('X-Visible', 'yes');
            const seen = JSON.parse(res.text);
            expect(seen).toContain('x-visible');
            expect(seen).not.toContain('x-forwarded-proto');
            expect(seen).not.toContain('x-edge-location');
            expect(seen).not.toContain('connection');
        });

        test('adding a disallowed header is a 502 validation error in strict mode', async () => {
            const runner = edgeRunner({ 'add.js': `
                exports.hookType = 'origin-response';
                exports.handler = async (event) => {
                    const res = event.Records[0].cf.response;
                    res.headers['x-cache'] = [{ key: 'X-Cache', value: 'Hit' }];
                    return res;
                };
            ` }, { strict: true });
            const res = await request(await serve({ edgeRunner: runner, strict: true })).get('/index.html');
            expect(res.status).toBe(502);
            expect(res.text).toContain('LambdaValidationError');
            expect(res.text).toContain('x-cache inside origin-response: disallowed header');
        });

        test('Host is read-only in viewer-request but can be changed in origin-request', async () => {
            const mutateHost = (stage: string) => `
                exports.hookType = '${stage}';
                exports.handler = async (event) => {
                    const req = event.Records[0].cf.request;
                    req.headers['host'] = [{ key: 'Host', value: 'other.example' }];
                    return req;
                };
            `;
            const viewer = await request(await serve({ edgeRunner: edgeRunner({ 'h.js': mutateHost('viewer-request') }, { strict: true }), strict: true })).get('/index.html');
            expect(viewer.status).toBe(502);
            expect(viewer.text).toContain('host inside viewer-request: read-only header');

            const origin = await request(await serve({ edgeRunner: edgeRunner({ 'h.js': mutateHost('origin-request') }, { strict: true }), strict: true })).get('/index.html');
            expect(origin.status).toBe(200);
        });

        test('a Lambda@Edge viewer-request function can\'t add CloudFront-Viewer-Country', async () => {
            const runner = edgeRunner({ 'geo.js': `
                exports.hookType = 'viewer-request';
                exports.handler = async (event) => {
                    const req = event.Records[0].cf.request;
                    req.headers['cloudfront-viewer-country'] = [{ key: 'CloudFront-Viewer-Country', value: 'FR' }];
                    return req;
                };
            ` }, { strict: true });
            const res = await request(await serve({ edgeRunner: runner, strict: true })).get('/index.html');
            expect(res.status).toBe(502);
            expect(res.text).toContain('cloudfront-viewer-country');
        });

        test('CloudFront Functions are validated too (FunctionValidationError)', async () => {
            const runner = cffRunner({ 'viewer-request-edge.js': `
                function handler(event) {
                    event.request.headers['x-edge-origin'] = { value: 'nope' };
                    return event.request;
                }
            ` }, { strict: true });
            const res = await request(await serve({ cffRunner: runner, strict: true })).get('/index.html');
            expect(res.status).toBe(502);
            expect(res.text).toContain('FunctionValidationError');
            expect(res.text).toContain('x-edge-origin');
        });
    });

    describe('Size limits', () => {
        test('generated responses are limited to 40 KB on viewer events and 1 MB on origin events', async () => {
            const generate = (stage: string) => `
                exports.hookType = '${stage}';
                exports.handler = async () => ({ status: '200', headers: {}, body: 'x'.repeat(41 * 1024) });
            `;
            const viewer = await request(await serve({ edgeRunner: edgeRunner({ 'g.js': generate('viewer-request') }, { strict: true }), strict: true })).get('/');
            expect(viewer.status).toBe(502);
            expect(viewer.text).toContain('Generated response too large');

            const origin = await request(await serve({ edgeRunner: edgeRunner({ 'g.js': generate('origin-request') }, { strict: true }), strict: true })).get('/');
            expect(origin.status).toBe(200);
            expect(origin.text.length).toBe(41 * 1024);
        });

        test('a replaced viewer-request body over 40 KB (text) is a 502 validation error', async () => {
            const runner = edgeRunner({ 'r.js': `
                exports.hookType = 'viewer-request';
                exports.handler = async (event) => {
                    const req = event.Records[0].cf.request;
                    req.body = { action: 'replace', encoding: 'text', data: 'y'.repeat(41 * 1024) };
                    return req;
                };
            ` }, { strict: true });
            const res = await request(await serve({ edgeRunner: runner, strict: true })).post('/index.html').send('small');
            expect(res.status).toBe(502);
            expect(res.text).toContain('Replaced request body too large');
        });

        test('a CloudFront Function over 10 KB is a build error in strict mode', async () => {
            const padding = '// ' + 'p'.repeat(11 * 1024);
            const runner = cffRunner({ 'viewer-request-big.js': `${padding}\nfunction handler(event) { return event.request; }` }, { strict: true });
            const res = await request(await serve({ cffRunner: runner, strict: true })).get('/index.html');
            expect(res.status).toBe(502);
            expect(res.text).toContain('10 KB');
        });
    });

    describe('Pipeline behavior', () => {
        test('viewer-response functions are not invoked when the origin returns 400 or higher', async () => {
            const runner = edgeRunner({ 'vr.js': `
                exports.hookType = 'viewer-response';
                exports.handler = async (event) => {
                    const res = event.Records[0].cf.response;
                    res.headers['x-viewer-response'] = [{ key: 'X-Viewer-Response', value: 'ran' }];
                    return res;
                };
            ` });
            const server = await serve({ edgeRunner: runner });
            const ok = await request(server).get('/index.html');
            expect(ok.headers['x-viewer-response']).toBe('ran');

            const missing = await request(server).get('/does-not-exist.html');
            expect(missing.status).toBe(404);
            expect(missing.headers['x-viewer-response']).toBeUndefined();
        });

        test('a Lambda@Edge viewer-response function can\'t change the status code', async () => {
            const runner = edgeRunner({ 'status.js': `
                exports.hookType = 'viewer-response';
                exports.handler = async (event) => {
                    const res = event.Records[0].cf.response;
                    res.status = '418';
                    return res;
                };
            ` });
            const res = await request(await serve({ edgeRunner: runner })).get('/index.html');
            expect(res.status).toBe(200);
        });

        test('rewriting the URI doesn\'t change the origin the request goes to', async () => {
            const configPath = path.join(tmpDir, 'origins.json');
            const otherDir = path.join(tmpDir, 'other');
            fs.mkdirSync(path.join(otherDir, 'api'), { recursive: true });
            fs.writeFileSync(path.join(otherDir, 'api', 'data.json'), '{"from":"other"}');
            fs.writeFileSync(path.join(otherDir, 'index.html'), 'other-index');
            fs.writeFileSync(configPath, JSON.stringify({
                origins: [
                    { id: 'main', type: 'local', directory: path.join(tmpDir, 'www') },
                    { id: 'other', type: 'local', directory: otherDir }
                ],
                behaviors: [
                    { pathPattern: '/api/*', targetOriginId: 'other' },
                    { pathPattern: '*', targetOriginId: 'main' }
                ]
            }));
            // Rewrites "/" to "/api/data.json": the behavior (and origin) stays the one matched by "/"
            const runner = edgeRunner({ 'rw.js': `
                exports.hookType = 'viewer-request';
                exports.handler = async (event) => {
                    const req = event.Records[0].cf.request;
                    req.uri = '/api/data.json';
                    return req;
                };
            ` });
            const res = await request(await serve({ edgeRunner: runner, origins: configPath })).get('/');
            expect(res.text).toBe('{"from":"local"}');
        });

        test('CloudFront Functions and Lambda@Edge can\'t be combined in viewer events', async () => {
            const cff = () => cffRunner({ 'viewer-request-pass.js': 'function handler(event) { return event.request; }' });
            const lae = (opts: any = {}) => edgeRunner({ 'vres.js': `
                exports.hookType = 'viewer-response';
                exports.handler = async (event) => event.Records[0].cf.response;
            ` }, opts);

            const strict = await request(await serve({ cffRunner: cff(), edgeRunner: lae({ strict: true }), strict: true })).get('/index.html');
            expect(strict.status).toBe(502);
            expect(strict.text).toContain('InvalidFunctionAssociation');

            const lenient = await request(await serve({ cffRunner: cff(), edgeRunner: lae() })).get('/index.html');
            expect(lenient.status).toBe(200);
        });
    });
});
