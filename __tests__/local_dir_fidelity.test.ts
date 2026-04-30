import request from 'supertest';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { startServer } from '../src/index';

describe('LocalProvider Directory Fidelity', () => {
    const tmpDir = path.join(__dirname, '..', '.tmp', 'dir_fidelity');
    const port = 3051;
    let server: any;

    beforeAll(() => {
        if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
        fs.mkdirSync(tmpDir, { recursive: true });
        
        // Setup: folder with index.html
        const subDir = path.join(tmpDir, 'countries', 'MX');
        fs.mkdirSync(subDir, { recursive: true });
        fs.writeFileSync(path.join(subDir, 'index.html'), 'MX Index');
    });

    afterAll(() => {
        if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    afterEach(async () => {
        if (server) await server.closeGracefully();
    });

    test('Case 1: REST Mode should return 404 for directories (not 403)', async () => {
        server = startServer({ directory: tmpDir, port, mode: 'rest', noBanner: true });
        
        // CloudFront REST: /countries/MX is a key that doesn't exist as a file
        const res = await request(server).get('/countries/MX');
        
        expect(res.status).toBe(404); // Fails today (returns 403)
    });

    test('Case 2: Website Mode should serve index.html for directories (not listing)', async () => {
        server = startServer({ directory: tmpDir, port, mode: 'website', noBanner: true });
        
        // S3 Website: /countries/MX should either serve index or redirect to /countries/MX/
        const res = await request(server).get('/countries/MX');
        
        if (res.status === 301 || res.status === 302) {
            expect(res.header.location).toBe('/countries/MX/');
            const follow = await request(server).get('/countries/MX/');
            expect(follow.status).toBe(200);
            expect(follow.text).toBe('MX Index');
        } else {
            expect(res.status).toBe(200);
            expect(res.text).toBe('MX Index'); // Fails today (returns directory listing)
        }
    });
});
