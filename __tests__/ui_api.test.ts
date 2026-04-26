export {};
'use strict';

const { startServer } = require('../src/index');
const http = require('http');
const path = require('path');
const fs = require('fs');

describe.skip('Developer UI API', () => {
    jest.setTimeout(30000);
    let server;
    const port = Math.floor(Math.random() * 1000) + 5000;
    const uiPort = Math.floor(Math.random() * 1000) + 6000;
    // Standardize to .tmp folder
    const testDir = path.join(__dirname, '..', '.tmp', 'ui_test_' + Date.now());

    beforeAll(() => {
        if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
        fs.writeFileSync(path.join(testDir, 'index.html'), 'Hello');
        
        server = startServer({
            port,
            webui: uiPort,
            directory: testDir,
            noBanner: true,
            debug: true
        });
    });

    afterAll(async () => {
        if (server) await server.closeGracefully();
        if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
    });

    test('should serve UI index.html at root of UI port', (done) => {
        http.get(`http://localhost:${uiPort}/`, (res) => {
            expect(res.statusCode).toBe(200);
            expect(res.headers['content-type']).toBe('text/html');
            done();
        });
    });

    test('should serve UI style.css from UI port', (done) => {
        http.get(`http://localhost:${uiPort}/style.css`, (res) => {
            expect(res.statusCode).toBe(200);
            expect(res.headers['content-type']).toBe('text/css');
            done();
        });
    });

    test('should accept header overrides via POST on UI port', (done) => {
        const data = JSON.stringify({
            request: { 'X-Test-Override': 'True' },
            response: { 'X-Mock-Origin': 'S3' }
        });

        const req = http.request({
            hostname: 'localhost',
            port: uiPort,
            path: '/headers',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': data.length
            }
        }, (res) => {
            expect(res.statusCode).toBe(200);
            
            // Verify next request (on main port) has the headers
            http.get(`http://localhost:${port}/`, (res2) => {
                expect(res2.headers['x-mock-origin']).toBe('S3');
                done();
            });
        });

        req.write(data);
        req.end();
    });

    test('should provide detailed request history on UI port', (done) => {
        // 1. Listen for the next request event to get the ID
        const eventReq = http.get(`http://localhost:${uiPort}/events`, (eventRes) => {
            eventRes.on('data', (chunk) => {
                const str = chunk.toString();
                if (str.includes('"type":"request"')) {
                    const eventData = JSON.parse(str.replace('data: ', ''));
                    const requestId = eventData.request.id;

                    // 2. Fetch the details using that ID
                    http.get(`http://localhost:${uiPort}/request/${requestId}`, (historyRes) => {
                        expect(historyRes.statusCode).toBe(200);
                        let body = '';
                        historyRes.on('data', c => body += c);
                        historyRes.on('end', () => {
                            const detail = JSON.parse(body);
                            expect(detail.id).toBe(requestId);
                            expect(detail.headers).toBeDefined();
                            expect(detail.bodySnippet).toBeDefined();
                            eventReq.destroy();
                            done();
                        });
                    });
                }
            });
        });

        // 3. Trigger a request on main port
        setTimeout(() => {
            http.get(`http://localhost:${port}/test-history`, () => {});
        }, 100);
    });

    test('should provide SSE endpoint at /events on UI port', (done) => {
        const req = http.get(`http://localhost:${uiPort}/events`, (res) => {
            expect(res.statusCode).toBe(200);
            expect(res.headers['content-type']).toBe('text/event-stream');
            
            res.on('data', (chunk) => {
                const lines = chunk.toString().split('\n');
                const dataLine = lines.find(l => l.startsWith('data: '));
                if (dataLine) {
                    const data = JSON.parse(dataLine.replace('data: ', ''));
                    expect(data.type).toBe('init');
                    expect(data.port).toBe(port);
                    req.destroy();
                    done();
                }
            });
        });
    });
});

