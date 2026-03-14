'use strict';

const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

const cli_path = path.resolve(__dirname, '../bin/cli.js');

describe('E2E: Header Handshake & Hook Fidelity', () => {
    const tmp_dir = path.join(__dirname, 'tmp_e2e_dual_hooks');
    const www_dir = path.join(tmp_dir, 'www');
    const headers_file = path.join(tmp_dir, 'headers_test.json');
    const req_hook_file = path.join(tmp_dir, 'hook_request.js');
    const res_hook_file = path.join(tmp_dir, 'hook_response.js');
    const port = 3009;

    beforeAll(() => {
        if (fs.existsSync(tmp_dir)) fs.rmSync(tmp_dir, { recursive: true, force: true });
        fs.mkdirSync(www_dir, { recursive: true });
        fs.writeFileSync(path.join(www_dir, 'index.html'), '<html>E2E</html>');

        // 1. Headers configuration
        const header_config = {
            "requestheaders": { "x-e2e-secret": "Fidelity-Confirmed" },
            "responseheaders": { "server": "Origin-Apache" }
        };
        fs.writeFileSync(headers_file, JSON.stringify(header_config));

        // 2. Request Hook: Verify injection
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
        fs.writeFileSync(req_hook_file, req_code);

        // 3. Response Hook: Cloak the header
        const res_code = `
            exports.hookType = 'origin-response';
            exports.handler = async (event) => {
                const response = event.Records[0].cf.response;
                if (response.headers['server']) {
                    delete response.headers['server'];
                }
                return response;
            };
        `;
        fs.writeFileSync(res_hook_file, res_code);
    });

    afterAll(() => {
        if (fs.existsSync(tmp_dir)) fs.rmSync(tmp_dir, { recursive: true, force: true });
    });

    test('🚀 Should verify full Request/Response header lifecycle', (done) => {
        // Point --edge to the tmp_dir so it scans both hook files
        const cmd = `node ${cli_path} ${www_dir} --port ${port} --edge ${tmp_dir} --headers ${headers_file} --no-request-logging`;
        const child = exec(cmd);

        child.stdout.on('data', (data) => {
            if (data.includes('Loading headers from: (headers_test.json)')) {
                http.get(`http://localhost:${port}/index.html`, (res) => {
                    try {
                        // Check Request Hook success
                        expect(res.headers['x-verified']).toBe('Fidelity-Confirmed');

                        // Check Response Hook success (The 'server' header must be GONE)
                        expect(res.headers['server']).toBeUndefined();

                        child.kill();
                        done();
                    } catch (err) {
                        child.kill();
                        done(err);
                    }
                }).on('error', (err) => {
                    child.kill();
                    done(err);
                });
            }
        });

        child.stderr.on('data', (data) => {
            if (!data.includes('ExperimentalWarning')) {
                child.kill();
                done(new Error(`CLI Error: ${data}`));
            }
        });

        setTimeout(() => {
            child.kill();
            done(new Error('E2E Timeout: Headers loaded but hooks failed to execute.'));
        }, 8000);
    });
});
