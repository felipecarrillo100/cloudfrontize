export {};
const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');
const { startServer } = require('../src/index');

// Finds a free port P whose neighbour P + 1 is also free (a bare --webui uses the main port + 1)
const freePortPair = async (): Promise<number> => {
    // The main server listens on every interface; the WebUI on 127.0.0.1
    const isFree = (port: number, host?: string) => new Promise<boolean>((resolve) => {
        const probe = net.createServer().once('error', () => resolve(false));
        probe.listen(port, host, () => probe.close(() => resolve(true)));
    });
    for (let attempt = 0; attempt < 20; attempt++) {
        const port: number = await new Promise((resolve) => {
            const probe = net.createServer().listen(0, '127.0.0.1', () => {
                const { port: p } = probe.address();
                probe.close(() => resolve(p));
            });
        });
        if (port < 65535 && await isFree(port) && await isFree(port + 1, '127.0.0.1')) return port;
    }
    throw new Error('No free port pair found');
};

const getJson = (port: number, urlPath: string): Promise<{ status: number; text: string }> =>
    new Promise((resolve, reject) => {
        // 127.0.0.1, not localhost: localhost may resolve to ::1, where the WebUI doesn't listen
        http.get({ host: '127.0.0.1', port, path: urlPath }, (res: any) => {
            let data = '';
            res.on('data', (c: any) => data += c);
            res.on('end', () => resolve({ status: res.statusCode, text: data }));
        }).on('error', reject);
    });

describe('WebUI Defaults & Secret Handling', () => {
    const tmpDir = path.join(__dirname, '.tmp/', 'webui_defaults');
    let server: any;

    beforeAll(() => {
        if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
        fs.mkdirSync(path.join(tmpDir, 'www'), { recursive: true });
        fs.writeFileSync(path.join(tmpDir, 'www', 'index.html'), 'ok');
    });

    afterEach(async () => {
        if (server) await server.closeGracefully();
        server = null;
    });

    afterAll(() => {
        if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('a bare --webui (webui: true) serves the UI on the main port + 1', async () => {
        const port = await freePortPair();
        server = startServer({ port, directory: path.join(tmpDir, 'www'), webui: true, noBanner: true });
        await server.ready;
        await new Promise(resolve => setTimeout(resolve, 200));

        const res = await getJson(port + 1, '/api/v2/distribution');
        expect(res.status).toBe(200);
    });

    test('origin credentials are never sent to the WebUI', async () => {
        const configPath = path.join(tmpDir, 'origins.json');
        fs.writeFileSync(configPath, JSON.stringify({
            origins: [{
                id: 'assets', type: 's3', bucket: 'secret-bucket', endpoint: 'http://127.0.0.1:1',
                credentials: { accessKeyId: 'AKIAEXAMPLEKEY', secretAccessKey: 'super-secret-value', sessionToken: 'session-token-value' }
            }],
            behaviors: [{ pathPattern: '*', targetOriginId: 'assets' }]
        }));
        const port = await freePortPair();
        server = startServer({ port, origins: configPath, webui: true, noBanner: true });
        await server.ready;
        await new Promise(resolve => setTimeout(resolve, 200));

        const res = await getJson(port + 1, '/api/v2/distribution');
        expect(res.status).toBe(200);
        expect(res.text).not.toContain('super-secret-value');
        expect(res.text).not.toContain('AKIAEXAMPLEKEY');
        expect(res.text).not.toContain('session-token-value');
        expect(JSON.parse(res.text).origins[0].credentials).toEqual({ configured: true });
    });
});
