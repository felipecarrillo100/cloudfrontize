export {};
const request = require('supertest');
const { startServer } = require('../src/index');
const { EdgeRunner } = require('../src/edgeRunner');
const fs = require('fs');
const path = require('path');

// A viewer-request hook replaces the body; an origin-request hook echoes what it received,
// which is exactly what would be forwarded to the origin.
describe('Request Body Replacement', () => {
    const tmpDir = path.join(__dirname, '.tmp/', 'request_body_replace');
    const servers: any[] = [];

    const ECHO_ORIGIN_REQUEST = `
        exports.hookType = 'origin-request';
        exports.handler = async (event) => {
            const req = event.Records[0].cf.request;
            return { status: '200', headers: {}, body: Buffer.from(req.body.data, 'base64').toString('utf8') };
        };
    `;

    const serveWithViewerHook = async (name: string, viewerCode: string) => {
        const dir = path.join(tmpDir, name);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'a-viewer.js'), viewerCode);
        fs.writeFileSync(path.join(dir, 'b-origin.js'), ECHO_ORIGIN_REQUEST);
        const runner = new EdgeRunner(dir, { watch: false });
        runner.load();
        const server = startServer({ port: 0, directory: tmpDir, edgeRunner: runner, noBanner: true });
        await server.ready;
        servers.push(server);
        return server;
    };

    beforeAll(() => {
        if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
        fs.mkdirSync(tmpDir, { recursive: true });
    });

    afterEach(async () => {
        while (servers.length) await servers.pop().closeGracefully();
    });

    afterAll(() => {
        if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('a replacement on a returned new request object is forwarded', async () => {
        const server = await serveWithViewerHook('new_object', `
            exports.hookType = 'viewer-request';
            exports.handler = async (event) => {
                const req = event.Records[0].cf.request;
                return { ...req, body: { action: 'replace', encoding: 'base64', data: Buffer.from('NEW').toString('base64') } };
            };
        `);
        const res = await request(server).post('/submit').send('old');
        expect(res.text).toBe('NEW');
    });

    test('a text-encoded replacement is not base64-decoded', async () => {
        const server = await serveWithViewerHook('text_encoding', `
            exports.hookType = 'viewer-request';
            exports.handler = async (event) => {
                const req = event.Records[0].cf.request;
                req.body.action = 'replace';
                req.body.encoding = 'text';
                req.body.data = 'plain text body';
                return req;
            };
        `);
        const res = await request(server).post('/submit').send('old');
        expect(res.text).toBe('plain text body');
    });
});
