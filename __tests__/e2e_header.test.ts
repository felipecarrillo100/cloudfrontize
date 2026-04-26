import { exec, execSync, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';

describe('E2E: Header Validation and Server Lifecycle', () => {
    jest.setTimeout(45000); // 45s total for the whole suite
    const port = Math.floor(Math.random() * 20000) + 12000;
    const cli_path = path.resolve(__dirname, '../bin/cli.ts');
    const tsx_path = path.resolve(__dirname, '../node_modules/tsx/dist/cli.mjs');
    const tmp_dir = path.resolve(__dirname, '..', '.tmp', `e2e_header_${Date.now()}`);
    const www_dir = path.join(tmp_dir, 'www');

    beforeAll(() => {
        if (!fs.existsSync(tmp_dir)) fs.mkdirSync(tmp_dir, { recursive: true });
        if (!fs.existsSync(www_dir)) fs.mkdirSync(www_dir, { recursive: true });
        fs.writeFileSync(path.join(www_dir, 'index.html'), 'Hello');

        // Valid Lambda hook (viewer-response to test header injection to client)
        fs.writeFileSync(path.join(tmp_dir, 'hook.js'), `
            exports.hookType = 'viewer-response';
            exports.handler = async (event) => {
                const res = event.Records[0].cf.response;
                res.headers['x-e2e-test'] = [{ key: 'X-E2E-Test', value: 'Passed' }];
                return res;
            };
        `);
    });

    afterAll(async () => {
        // Use synchronous cleanup to avoid race conditions with process exit
        if (fs.existsSync(tmp_dir)) {
            try {
                // On Windows, use a specialized command to force delete if normal rm fails
                fs.rmSync(tmp_dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
            } catch (e) {
                // Fallback for Windows locked files
                try { exec(`rmdir /s /q "${tmp_dir}"`); } catch (e2) {}
            }
        }
    });

    test('Should start CLI, validate headers, apply hook, and respond correctly', async () => {
        // Headers file with responseHeaders block (required for response injection)
        const headers_obj = {
            responseHeaders: {
                'X-Valid-Global': 'Value1'
            }
        };
        const headers_file = path.join(tmp_dir, 'headers_test.json');
        fs.writeFileSync(headers_file, JSON.stringify(headers_obj));

        // Use node + tsx directly for better stability on Windows. Add --debug for [Ready] signal.
        const cmd = `node "${tsx_path}" "${cli_path}" "${www_dir}" --port ${port} --edge "${tmp_dir}" --headers "${headers_file}" --no-request-logging --debug`;
        
        let child: ChildProcess | undefined;
        let failTimer: any;
        let readyTimer: any;
        const startup = new Promise<void>((resolve, reject) => {
            child = exec(cmd);
            if (!child.stdout || !child.stderr) {
                reject(new Error('Failed to capture child process output streams'));
                return;
            }
            child.stdout.on('data', (data: any) => {
                const out = data.toString();
                // Check specifically for the [Ready] signal which only appears after listen()
                if (out.includes('[Ready]')) {
                    // Give it 1 more second to be truly ready for HTTP
                    readyTimer = setTimeout(() => {
                        clearTimeout(failTimer);
                        resolve();
                    }, 1000);
                }
            });
            child.stderr.on('data', (data: any) => {
                const err = data.toString();
                if (err.includes('Error:')) {
                    if (failTimer) clearTimeout(failTimer);
                    if (readyTimer) clearTimeout(readyTimer);
                    reject(new Error(`CLI Error during startup: ${err}`));
                }
            });

            failTimer = setTimeout(() => {
                reject(new Error(`CLI Timeout: Failed to start after 15s.\nCommand: ${cmd}`));
            }, 15000);
        });

        try {
            await startup;

            // Perform the request using a clean async wrapper
            const response = await new Promise<{ status?: number; headers: http.IncomingHttpHeaders; body: string }>((resolve, reject) => {
                const req = http.get(`http://localhost:${port}/`, (res: http.IncomingMessage) => {
                    let body = '';
                    res.on('data', (chunk: any) => body += chunk);
                    res.on('end', () => resolve({
                        status: res.statusCode,
                        headers: res.headers,
                        body
                    }));
                });
                req.on('error', reject);
                req.end();
            });

            // ASSERTIONS
            expect(response.status).toBe(200);
            
            // 1. Check Global Headers (using lowercase standard for http.get response objects)
            expect(response.headers['x-valid-global']).toBe('Value1');
            
            // 2. Check Lambda Hook Headers
            expect(response.headers['x-e2e-test']).toBe('Passed');

        } finally {
            if (failTimer) clearTimeout(failTimer);
            if (readyTimer) clearTimeout(readyTimer);
            if (child) {
                // Kill process tree on Windows for clean exit
                if (process.platform === 'win32') {
                    try { execSync(`taskkill /pid ${child.pid} /f /t`); } catch (e) {}
                } else {
                    child.kill('SIGINT');
                }
            }
        }
    });
});

