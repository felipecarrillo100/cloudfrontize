export {};
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const cliPath = path.resolve(__dirname, '../bin/cli.ts');
// Internal tsx binary path for reliable execution
const tsxPath = path.resolve(__dirname, '../node_modules/tsx/dist/cli.mjs');

describe('CLI Argument Validation', () => {
    jest.setTimeout(30000); // Global increase for tsx bootstrap
    const tmpDir = path.join(__dirname, '..', '.tmp', 'cli_test_' + Date.now());
    const edgeFile = path.join(tmpDir, 'edge.js');
    const outputFile = path.join(tmpDir, 'output.js');

    beforeAll(() => {
        if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
        fs.mkdirSync(tmpDir, { recursive: true });
        fs.writeFileSync(edgeFile, "exports.hookType = 'viewer-request'; exports.handler = (e, c, cb) => cb(null, e.Records[0].cf.request);");
    });

    afterAll(() => {
        if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('Should exit with error when no directory or --output is provided', (done) => {
        exec(`node ${tsxPath} ${cliPath}`, (error, stdout, stderr) => {
            expect(error).not.toBeNull();
            expect(error.code).toBe(1);
            expect(stderr).toContain('Error: A directory to serve or --s3-origin must be provided');
            done();
        });
    });

    test('Should perform baking and exit when --output is provided without directory', (done) => {
        exec(`node ${tsxPath} ${cliPath} --output ${outputFile} --edge ${edgeFile}`, (error, stdout, stderr) => {
            expect(error).toBeNull();
            expect(stdout).toContain('Production-ready file(s) generated');
            done();
        });
    });

    test('Should fail if --bake/--output used without --edge source', (done) => {
        exec(`node ${tsxPath} ${cliPath} . --output ${outputFile}`, (error, stdout, stderr) => {
            expect(error).not.toBeNull();
            expect(error.code).toBe(1);
            expect(stderr).toContain('Error: --bake and --output require a source --edge or --cff file');
            done();
        });
    });
});
