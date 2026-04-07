export {};
'use strict';

const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

const cli_path = path.resolve(__dirname, '../bin/cli.ts');

describe('E2E: Header Handshake & Hook Fidelity', () => {
    jest.setTimeout(30000); // Allow up to 30s for parallel test runners
    let child;
    // Dynamic port to prevent "Address already in use" errors across massive parallel suites
    const port = Math.floor(Math.random() * 20000) + 10000;
    const tmp_dir = path.join(__dirname, '..', '.tmp', `tmp_e2e_${Date.now()}_${Math.floor(Math.random() * 1000)}`);
    const www_dir = path.join(tmp_dir, 'www');

    beforeAll(() => {
        if (fs.existsSync(tmp_dir)) {
            try {
                fs.rmSync(tmp_dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
            } catch (e: any) {
                console.warn(`[E2E Cleanup] Initial Cleanup failed: ${e.message}`);
            }
        }
        fs.mkdirSync(www_dir, { recursive: true });
        fs.writeFileSync(path.join(www_dir, 'index.html'), '<html>E2E</html>');

        // 1. Headers configuration (Your Example)
        const header_config = {
            "requestheaders": { "x-e2e-secret": "Fidelity-Confirmed" },
            "responseheaders": { "server": "Origin-Apache" }
        };
        fs.writeFileSync(path.join(tmp_dir, 'headers_test.json'), JSON.stringify(header_config));

        // 2. Request Hook (Your Example)
        const req_code = `
            exports.hookType = 'origin-request';
            exports.handler = async (event) => {
                const request = event.Records[0].cf.request;
                if (request.headers['x-e2e-secret']) {
                    const val = request.headers['x-e2e-secret'][0].value;
                    request.headers['x-verified'] = [{ key: 'X-Verified', value: val }];
                }
                return request;
            };
        `;
        fs.writeFileSync(path.join(tmp_dir, 'hook_request.js'), req_code);

        // 3. Response Hook (Your Example)
        const res_code = `
            exports.hookType = 'origin-response';
            exports.handler = async (event) => {
                const request = event.Records[0].cf.request;
                const response = event.Records[0].cf.response;
                
                // Fidelity: If request had x-verified, mirror it to response
                if (request.headers['x-verified']) {
                    response.headers['x-verified'] = request.headers['x-verified'];
                }

                if (response.headers['server']) delete response.headers['server'];
                return response;
            };
        `;
        fs.writeFileSync(path.join(tmp_dir, 'hook_response.js'), res_code);
    });

    afterAll(async () => {
        if (child) {
            try { child.kill('SIGKILL'); } catch (e) {}
        }
        // Give the OS 500ms to release file locks before deleting the folder
        await new Promise(r => setTimeout(r, 500));
        
        if (fs.existsSync(tmp_dir)) {
            try {
                fs.rmSync(tmp_dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
            } catch (e: any) {
                console.warn(`[E2E Cleanup] Final Cleanup failed for ${tmp_dir}: ${e.message}`);
                // Fallback: manually unlink if directory is still there
                try { exec(`rmdir /s /q "${tmp_dir}"`); } catch (e2) {}
            }
        }
    });

    test('🚀 Should verify full Request/Response header lifecycle', async () => {
        const headers_file = path.join(tmp_dir, 'headers_test.json');
        const cmd = `npx tsx ${cli_path} ${www_dir} --port ${port} --edge ${tmp_dir} --headers ${headers_file} --no-request-logging`;

        // Start server and wait for the 'Ready' signal via a Promise
        await new Promise((resolve, reject) => {
            child = exec(cmd);
            child.stdout.on('data', (data) => {
                // Wait for your CLI's specific "Success" output
                if (data.includes('Loading headers') || data.includes(port.toString())) {
                    resolve(true);
                }
            });
            child.stderr.on('data', (data: any) => {
                if (!data.includes('ExperimentalWarning')) console.warn('CLI Stderr:', data);
            });
            setTimeout(() => reject(new Error('CLI Timeout: Failed to start after 25s')), 25000);
        });

        // Perform the request using a clean async wrapper
        const getResult = () => new Promise((resolve, reject) => {
            http.get(`http://localhost:${port}/index.html`, (res) => {
                resolve(res);
            }).on('error', reject);
        });

        const res: any = await getResult();

        // ASSERTIONS (Using your exact logic)
        expect(res.headers['x-verified']).toBe('Fidelity-Confirmed');
        expect(res.headers['server']).toBeUndefined();
    });
});
