export {};
const request = require('supertest');
const { startServer } = require('../src/index');
const { EdgeRunner } = require('../src/edgeRunner');
const fs = require('fs');
const path = require('path');

describe('Generated Response Hygiene', () => {
    const tmpDir = path.join(__dirname, '.tmp/', 'response_hygiene');
    const edgeDir = path.join(tmpDir, 'edge');
    let server: any;

    beforeAll(() => {
        if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
        fs.mkdirSync(edgeDir, { recursive: true });
        fs.writeFileSync(path.join(tmpDir, 'index.html'), 'origin');
        // Generates a base64 response so both header hygiene and bodyEncoding are exercised
        fs.writeFileSync(path.join(edgeDir, 'generate.js'), `
            exports.hookType = 'viewer-request';
            exports.handler = async () => ({
                status: '200',
                headers: { 'content-type': [{ key: 'Content-Type', value: 'text/plain' }] },
                bodyEncoding: 'base64',
                body: Buffer.from('decoded-body').toString('base64')
            });
        `);
        const runner = new EdgeRunner(edgeDir, { watch: false });
        runner.load();
        server = startServer({ port: 0, directory: tmpDir, edgeRunner: runner, noBanner: true });
    });

    afterAll(async () => {
        await server.closeGracefully();
        if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('internal record fields never become response headers', async () => {
        const res = await request(server).get('/');
        expect(res.status).toBe(200);
        for (const internal of ['id', 'type', 'uri', 'totaldurationms', 'bodyencoding']) {
            expect(res.headers[internal]).toBeUndefined();
        }
    });

    test('bodyEncoding: base64 is decoded before sending', async () => {
        const res = await request(server).get('/');
        expect(res.text).toBe('decoded-body');
    });
});
