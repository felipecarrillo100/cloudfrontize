import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import net from 'net';

describe('MinIO S3 Fidelity (Optional)', () => {
    let emulatorProcess: ChildProcess | null = null;
    const port = 9101;
    const tmpDir = path.join(__dirname, '..', '.tmp', 'minio_test');
    const minioEndpoint = 'http://127.0.0.1:9000';
    
    const cliPath = path.resolve(__dirname, '../dist/bin/cli.js');

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
            console.warn('⚠️  MinIO not detected at http://127.0.0.1:9000. Skipping MinIO provider tests.');
            return;
        }

        if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
        fs.mkdirSync(tmpDir, { recursive: true });

        const s3Config = {
            bucket: 'www',
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

        // Spawn emulator
        emulatorProcess = spawn('node', [
            '--experimental-vm-modules',
            cliPath,
            '--port', port.toString(),
            '--origins', configPath
        ], {
            cwd: path.resolve(__dirname, '..'),
            env: { ...process.env, NODE_ENV: 'test' }
        });

        let errorOutput = '';
        emulatorProcess.stderr?.on('data', (data) => errorOutput += data.toString());

        // Wait for port to be open (Polling)
        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Emulator failed to bind to port ${port} in 20s.\nSTDERR: ${errorOutput}`));
            }, 20000);

            const interval = setInterval(() => {
                const socket = net.connect(port, '127.0.0.1', () => {
                    socket.end();
                    clearInterval(interval);
                    clearTimeout(timeout);
                    resolve();
                });

                socket.on('error', () => {
                    // Port not open yet, ignore and retry
                });
            }, 500);

            emulatorProcess?.on('exit', (code) => {
                clearInterval(interval);
                clearTimeout(timeout);
                if (code !== 0) {
                    reject(new Error(`Emulator exited early with code ${code}.\nSTDERR: ${errorOutput}`));
                }
            });
        });
    }, 25000);

    afterAll(async () => {
        if (emulatorProcess) {
            emulatorProcess.kill('SIGINT');
        }
        if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('Should fetch index.html from real MinIO bucket', async () => {
        if (!minioAvailable) {
            console.log('Skipping MinIO test: Engine not found');
            return;
        }

        const res: any = await new Promise((resolve, reject) => {
            const req = http.get(`http://127.0.0.1:${port}/index.html`, resolve);
            req.on('error', reject);
        });

        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toBeDefined();
        
        let data = '';
        for await (const chunk of res) data += chunk;
        expect(data.toLowerCase()).toContain('<html'); 
    });
});
