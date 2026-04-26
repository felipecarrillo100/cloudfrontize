import request from 'supertest';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { startServer } from '../src/index';
import { EdgeRunner } from '../src/edgeRunner';

describe('--mode flag and Directory Indexing Fidelity', () => {
    const baseDir = path.join(__dirname, '.tmp', 'dir_indexing');
    const edgeDir = path.join(baseDir, 'edge');
    const port = 3008;

    let server: any;
    let edgeRunner: any;

    beforeAll(() => {
        if (fs.existsSync(baseDir)) fs.rmSync(baseDir, { recursive: true, force: true });
        fs.mkdirSync(baseDir, { recursive: true });
        fs.mkdirSync(edgeDir, { recursive: true });

        // Setup: root index.html
        fs.writeFileSync(path.join(baseDir, 'index.html'), 'Root File');

        // Setup: subfolder with index.html
        const subDir = path.join(baseDir, 'subfolder');
        fs.mkdirSync(subDir, { recursive: true });
        fs.writeFileSync(path.join(subDir, 'index.html'), 'Subfolder Index');

        // Setup: Lambda@Edge hook for testing rewrites
        fs.writeFileSync(path.join(edgeDir, 'hook.js'), `
            exports.hookType = 'origin-request';
            exports.handler = (event, context, callback) => {
                const request = event.Records[0].cf.request;
                if (request.uri === '/subfolder/') {
                    request.uri = '/subfolder/index.html';
                }
                callback(null, request);
            };
        `);
    });

    afterAll(() => {
        if (fs.existsSync(baseDir)) fs.rmSync(baseDir, { recursive: true, force: true });
    });

    afterEach(async () => {
        if (server) await server.closeGracefully();
        if (edgeRunner) edgeRunner.close();
        server = null;
        edgeRunner = null;
    });

    describe('Mode: website (S3 Website Hosting Fidelity)', () => {
        beforeEach(() => {
            server = startServer({ directory: baseDir, port, mode: 'website', noBanner: true });
        });

        test('Root (/) should serve index.html', async () => {
            const res = await request(server).get('/');
            expect(res.status).toBe(200);
            expect(res.text).toContain('Root File');
        });

        test('Subfolder with trailing slash (/subfolder/) should serve index.html', async () => {
            const res = await request(server).get('/subfolder/');
            expect(res.status).toBe(200);
            expect(res.text).toBe('Subfolder Index');
        });

        test('Subfolder without trailing slash (/subfolder) should redirect to /subfolder/', async () => {
            const res = await request(server).get('/subfolder');
            expect(res.status).toBe(301);
            expect(res.header.location).toBe('/subfolder/');
        });

        test('/random should return 404', async () => {
            const res = await request(server).get('/random');
            expect(res.status).toBe(404);
        });
    });

    describe('Mode: rest (Strict CloudFront Fidelity)', () => {
        test('Root (/) should STILL serve index.html safely', async () => {
            server = startServer({ directory: baseDir, port, mode: 'rest', noBanner: true });
            const res = await request(server).get('/');
            expect(res.status).toBe(200);
            expect(res.text).toContain('Root File');
        });

        test('Subfolder (/subfolder/) should return 404 (object not found)', async () => {
            server = startServer({ directory: baseDir, port, mode: 'rest', noBanner: true });
            const res = await request(server).get('/subfolder/');
            expect(res.status).toBe(404);
        });

        test('Subfolder without trailing slash (/subfolder) should return 404 (object not found)', async () => {
            server = startServer({ directory: baseDir, port, mode: 'rest', noBanner: true });
            const res = await request(server).get('/subfolder');
            expect(res.status).toBe(404);
        });

        test('Lambda@Edge Rewrite: /subfolder/ rewritten to /subfolder/index.html should succeed', async () => {
            edgeRunner = new EdgeRunner(edgeDir, { watch: false });
            edgeRunner.load();
            server = startServer({ directory: baseDir, port, mode: 'rest', noBanner: true, edgeRunner });

            const res = await request(server).get('/subfolder/');
            expect(res.status).toBe(200);
            expect(res.text).toBe('Subfolder Index');
        });
    });
});
