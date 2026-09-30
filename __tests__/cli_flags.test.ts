export {};
const request = require('supertest');
const { startServer } = require('../src/index');
const fs = require('fs');
const path = require('path');

// Options use the keys commander produces for the CLI flags:
// -u → compression:false, --no-etag → etag:false, -L → requestLogging:false, -C → cors, -s → single
describe('CLI Flag Behavior', () => {
    const tmpDir = path.join(__dirname, '.tmp/', 'cli_flags');
    const servers: any[] = [];

    const serve = (opts: any) => {
        const server = startServer({ port: 0, directory: tmpDir, noBanner: true, mode: 'rest', ...opts });
        servers.push(server);
        return server;
    };

    beforeAll(() => {
        if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
        fs.mkdirSync(tmpDir, { recursive: true });
        fs.writeFileSync(path.join(tmpDir, 'index.html'), '<html>spa-shell</html>');
        fs.writeFileSync(path.join(tmpDir, 'data.json'), JSON.stringify({ items: new Array(200).fill('payload') }));
    });

    afterEach(async () => {
        while (servers.length) await servers.pop().closeGracefully();
    });

    afterAll(() => {
        if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('compression is on by default and -u (compression:false) disables it', async () => {
        const on = await request(serve({})).get('/data.json').set('Accept-Encoding', 'gzip');
        expect(on.headers['content-encoding']).toBe('gzip');

        const off = await request(serve({ compression: false })).get('/data.json').set('Accept-Encoding', 'gzip');
        expect(off.headers['content-encoding']).toBeUndefined();
    });

    test('ETag and Last-Modified are sent by default; --no-etag removes the ETag', async () => {
        const on = await request(serve({})).get('/data.json');
        expect(on.headers['etag']).toBeDefined();
        expect(on.headers['last-modified']).toBeDefined();

        const off = await request(serve({ etag: false })).get('/data.json');
        expect(off.headers['etag']).toBeUndefined();
        expect(off.headers['last-modified']).toBeDefined();
    });

    test('-L (requestLogging:false) mutes the per-request access log', async () => {
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        const accessLogged = () => logSpy.mock.calls.some((args: any[]) => String(args[0]).includes('GET /data.json'));

        await request(serve({ noBanner: false })).get('/data.json');
        expect(accessLogged()).toBe(true);

        logSpy.mockClear();
        await request(serve({ noBanner: false, requestLogging: false })).get('/data.json');
        expect(accessLogged()).toBe(false);
        logSpy.mockRestore();
    });

    test('--cors adds Access-Control-Allow-Origin and answers preflights', async () => {
        const plain = await request(serve({})).get('/data.json');
        expect(plain.headers['access-control-allow-origin']).toBeUndefined();

        const server = serve({ cors: true });
        const res = await request(server).get('/data.json');
        expect(res.headers['access-control-allow-origin']).toBe('*');

        const preflight = await request(server)
            .options('/data.json')
            .set('Origin', 'http://example.com')
            .set('Access-Control-Request-Method', 'PUT')
            .set('Access-Control-Request-Headers', 'x-custom');
        expect(preflight.status).toBe(204);
        expect(preflight.headers['access-control-allow-methods']).toBe('PUT');
        expect(preflight.headers['access-control-allow-headers']).toBe('x-custom');
    });

    test('--single serves index.html for missing paths', async () => {
        const plain = await request(serve({})).get('/app/route/42');
        expect(plain.status).toBe(404);

        const spa = await request(serve({ single: true })).get('/app/route/42');
        expect(spa.status).toBe(200);
        expect(spa.text).toContain('spa-shell');
    });
});
