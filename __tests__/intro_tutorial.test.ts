export {};
const path = require('path');
const request = require('supertest');
const { startServer } = require('../src/index');
const { EdgeRunner } = require('../src/edgeRunner');

// tutorial/intro: the geo-rewrite example, run exactly as the article's command does (2.x CLI style)
describe('Tutorial intro: geo rewrite', () => {
    const introDir = path.resolve(__dirname, '..', 'tutorial', 'intro');
    let server: any;

    beforeAll(async () => {
        jest.spyOn(console, 'log').mockImplementation(() => {});
        const runner = new EdgeRunner(path.join(introDir, 'origin-request-geo.js'), { watch: false });
        runner.load();
        server = startServer({ port: 0, directory: path.join(introDir, 'www'), edgeRunner: runner, noBanner: true });
        await server.ready;
    });

    afterAll(async () => {
        await server.closeGracefully();
        jest.restoreAllMocks();
    });

    test('serves the default page when the country is not FR', async () => {
        const res = await request(server).get('/');
        expect(res.status).toBe(200);
        expect(res.text).toContain('<title>Main Site</title>');
    });

    test('rewrites French viewers to the French page', async () => {
        const res = await request(server).get('/').set('CloudFront-Viewer-Country', 'FR');
        expect(res.status).toBe(200);
        expect(res.text).toContain('<title>Plateforme France</title>');
    });
});
