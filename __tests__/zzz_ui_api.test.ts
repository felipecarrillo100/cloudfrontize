import { startServer, CloudFrontizeServer } from '../src';
import http from 'http';
import path from 'path';
import fs from 'fs';

const testDirBase = path.resolve('.tmp');

describe('Developer UI API (Visual Control Plane)', () => {
    jest.setTimeout(30000);
    let server: CloudFrontizeServer;
    const port = Math.floor(Math.random() * 1000) + 7000;
    const uiPort = Math.floor(Math.random() * 1000) + 8000;
    const testDir = path.join(testDirBase, 'zzz_ui_test_' + Date.now());

    beforeAll(async () => {
        if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
        fs.writeFileSync(path.join(testDir, 'index.html'), 'Hello');

        // Cast to our local interface so server.closeGracefully() is recognized
        server = startServer({
            port,
            webui: uiPort,
            directory: testDir,
            noBanner: true,
            debug: true
        }) as CloudFrontizeServer;

        // Wait for servers to be fully ready
        await new Promise(resolve => setTimeout(resolve, 500));
    });

    afterAll(async () => {
        if (server) await server.closeGracefully();
        if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
    });

    test('✅ should serve UI index.html at root', (done) => {
        http.get(`http://localhost:${uiPort}/`, (res) => {
            expect(res.statusCode).toBe(200);
            expect(res.headers['content-type']).toBe('text/html');
            done();
        });
    });

    test('✅ should serve Vite assets from /assets/ directory', (done) => {
        const assetsDir = path.join(process.cwd(), 'ui', 'assets');
        if (!fs.existsSync(assetsDir)) {
            return done();
        }
        const files = fs.readdirSync(assetsDir);
        const aFile = files.find(f => f.endsWith('.css') || f.endsWith('.js'));
        if (!aFile) return done();

        http.get(`http://localhost:${uiPort}/assets/${aFile}`, (res) => {
            expect(res.statusCode).toBe(200);
            expect(res.headers['content-type']).toMatch(/text\/(css|javascript)/);
            done();
        });
    });

    test('✅ should accept header overrides via POST /api/sticky', (done) => {
        const data = JSON.stringify({
            requestHeaders: { 'X-Sticky-Test': 'Active' },
            responseHeaders: { 'X-Mock-Cache': 'HIT' }
        });

        const req = http.request({
            hostname: 'localhost',
            port: uiPort,
            path: '/api/sticky',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        }, (res) => {
            if (res.statusCode !== 200) {
                let body = '';
                res.on('data', c => body += c);
                res.on('end', () => {
                    console.error(`❌ POST /api/sticky failed with ${res.statusCode}: ${body}`);
                    expect(res.statusCode).toBe(200);
                    done();
                });
                return;
            }
            expect(res.statusCode).toBe(200);

            http.get(`http://localhost:${port}/`, (res2) => {
                expect(res2.headers['x-mock-cache']).toBe('HIT');
                done();
            });
        });

        req.write(data);
        req.end();
    });

    test('✅ should provide detailed request forensic via /api/detail/{id}', (done) => {
        let requestId = '';
        const eventReq = http.get(`http://localhost:${uiPort}/events`, (eventRes) => {
            eventRes.on('data', (chunk: Buffer) => {
                const str = chunk.toString();
                const lines = str.split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const eventData = JSON.parse(line.replace('data: ', ''));
                            if (eventData.type === 'request') {
                                requestId = eventData.id;
                                setTimeout(() => {
                                    http.get(`http://localhost:${uiPort}/api/detail/${requestId}`, (historyRes) => {
                                        expect(historyRes.statusCode).toBe(200);
                                        let body = '';
                                        historyRes.on('data', c => body += c);
                                        historyRes.on('end', () => {
                                            const details = JSON.parse(body);
                                            expect(Array.isArray(details)).toBe(true);
                                            expect(details.some((d: any) => d.id === requestId)).toBe(true);
                                            eventReq.destroy();
                                            done();
                                        });
                                    });
                                }, 100);
                            }
                        } catch (e) { }
                    }
                }
            });
        });

        setTimeout(() => {
            http.get(`http://localhost:${port}/forensic-test`, () => { });
        }, 300);
    });

    test('✅ should provide SSE endpoint at /events with init handshake', (done) => {
        const req = http.get(`http://localhost:${uiPort}/events`, (res) => {
            expect(res.statusCode).toBe(200);
            expect(res.headers['content-type']).toBe('text/event-stream');

            res.on('data', (chunk: Buffer) => {
                const str = chunk.toString();
                if (str.includes('"type":"init"')) {
                    const line = str.split('\n').find(l => l.includes('"type":"init"'));
                    if (line) {
                        const data = JSON.parse(line.replace('data: ', ''));
                        expect(data.port).toBe(port);
                        req.destroy();
                        done();
                    }
                }
            });
        });
    });
});
