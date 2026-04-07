import http from 'http';
import fs from 'fs';
import path from 'path';
import { startServer } from '../src/index';

describe('MinIO S3 Fidelity (Optional)', () => {
    let server: any;
    const port = 9101;
    const tmpDir = path.join(__dirname, '..', '.tmp', 'minio_test');
    const minioEndpoint = 'http://localhost:9000';
    
    let minioAvailable = false;

    beforeAll(async () => {
        // Check if MinIO is actually running
        minioAvailable = await new Promise((resolve) => {
            const req = http.request(minioEndpoint + '/minio/health/live', { method: 'GET', timeout: 1000 }, (res) => {
                resolve(res.statusCode === 200);
            });
            req.on('error', () => resolve(false));
            req.end();
        });

        if (!minioAvailable) {
            console.warn('⚠️  MinIO not detected at http://localhost:9000. Skipping MinIO provider tests.');
            return;
        }

        if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
        fs.mkdirSync(tmpDir, { recursive: true });

        const s3Config = {
            bucket: 'www', // Assuming 'www' bucket exists as per user instructions
            region: 'us-east-1',
            endpoint: minioEndpoint,
            credentials: {
                accessKeyId: 'minioadmin',
                secretAccessKey: 'minioadmin123'
            },
            forcePathStyle: true
        };
        const configPath = path.join(tmpDir, 'minio_config.json');
        fs.writeFileSync(configPath, JSON.stringify(s3Config));

        server = startServer({
            port,
            origins: configPath,
            noBanner: true,
            noRequestLogging: true
        });
    });

    afterAll(async () => {
        if (server) await server.closeGracefully();
        if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('Should fetch index.html from real MinIO bucket', async () => {
        if (!minioAvailable) {
            console.log('Skipping MinIO test: Engine not found');
            return;
        }

        const res: any = await new Promise((resolve, reject) => {
            http.get(`http://localhost:${port}/index.html`, resolve).on('error', reject);
        });

        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toBeDefined();
        
        let data = '';
        for await (const chunk of res) data += chunk;
        expect(data.toLowerCase()).toContain('<html'); 
    });
});
