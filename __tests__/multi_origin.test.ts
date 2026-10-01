import http from 'http';
import net from 'net';
import fs from 'fs';
import path from 'path';
import { startServer } from '../src/index';

describe('Multi-Origin Routing Fidelity', () => {
    let server: any;
    const port = 9100;
    const tmpDir = path.join(__dirname, '..', '.tmp', 'multi_origin_test');
    
    beforeAll(async () => {
        if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
        fs.mkdirSync(path.join(tmpDir, 'static'), { recursive: true });
        fs.writeFileSync(path.join(tmpDir, 'static', 'hello.txt'), 'local-content');

        // Reserve a free port and release it, so the S3 endpoint is guaranteed to refuse connections
        const deadPort: number = await new Promise((resolve) => {
            const probe = net.createServer().listen(0, '127.0.0.1', () => {
                const { port: p } = probe.address() as net.AddressInfo;
                probe.close(() => resolve(p));
            });
        });
        
        const s3Config = {
            origins: [
                { id: 'local', type: 'local', directory: path.join(tmpDir, 'static') },
                { id: 'remote', type: 's3', bucket: 'test-bucket', endpoint: `http://127.0.0.1:${deadPort}`, credentials: { accessKeyId: 'test', secretAccessKey: 'test' } } // Unreachable endpoint
            ],
            behaviors: [
                { pathPattern: '/api/*', targetOriginId: 'remote' },
                { pathPattern: '*', targetOriginId: 'local' }
            ]
        };
        const configPath = path.join(tmpDir, 's3_config.json');
        fs.writeFileSync(configPath, JSON.stringify(s3Config));

        server = startServer({
            port,
            origins: configPath,
            noBanner: true
        });
        await server.ready;
    });

    afterAll(async () => {
        await server.closeGracefully();
        if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('Should route /static path to LocalProvider (Default)', async () => {
        const res: any = await new Promise((resolve) => {
            http.get(`http://localhost:${port}/hello.txt`, resolve);
        });
        
        let data = '';
        for await (const chunk of res) data += chunk;
        
        expect(res.statusCode).toBe(200);
        expect(data).toBe('local-content');
    });

    test('Should route /api/* path to S3Provider (Remote)', async () => {
        // We expect a 502/Error because the reserved endpoint port is closed, 
        // which proves it TRIED to go to S3 instead of Local.
        const res: any = await new Promise((resolve) => {
            http.get(`http://localhost:${port}/api/data.json`, resolve);
        });
        
        let data = '';
        for await (const chunk of res) data += chunk;
        
        expect(res.statusCode).toBe(502);
        expect(data).toContain('S3 Origin Error');
    });
});

