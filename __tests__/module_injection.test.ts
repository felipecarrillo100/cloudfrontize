export {};
const { EdgeRunner } = require('../src/edgeRunner');
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * AWS: Lambda@Edge has "network access" and "file system access", and can use any module it
 * bundles, in every event ("Differences between CloudFront Functions and Lambda@Edge"). These
 * tests load real modules and check they really loaded, in all four events.
 */
const EVENTS = ['viewer-request', 'origin-request', 'origin-response', 'viewer-response'];

// Runs a hook for its event and returns the JSON it reports in X-Report
async function report(dir: string, event: string) {
    const runner = new EdgeRunner(dir, { watch: false });
    runner.load();
    try {
        const { result } = event.endsWith('request')
            ? await runner.runRequestHook({ url: '/', headers: {} })
            : await runner.runResponseHook({ url: '/', headers: {} }, { status: 200, headers: {} }, 'test', event);
        return JSON.parse(result.headers['x-report'][0].value);
    } finally {
        runner.close();
    }
}

const hookSource = (event: string, body: string) => `
    exports.hookType = '${event}';
    exports.handler = async (e) => {
        const cf = e.Records[0].cf;
        const target = cf.response || cf.request;
        const out = {};
        ${body}
        target.headers['x-report'] = [{ key: 'X-Report', value: JSON.stringify(out) }];
        return target;
    };`;

describe('Lambda@Edge modules (as in AWS)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cfz-modules-'));
    afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

    test.each(EVENTS)('%s: built-in modules, including fs, http, os and child_process, load', async (event) => {
        const dir = path.join(root, `builtins-${event}`);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'hook.js'), hookSource(event, `
            for (const id of ['fs', 'fs/promises', 'node:fs', 'http', 'https', 'net', 'os', 'child_process', 'crypto', 'zlib', 'path']) {
                try { out[id] = typeof require(id); } catch (err) { out[id] = 'failed: ' + err.message; }
            }`));
        const out = await report(dir, event);
        for (const id of Object.keys(out)) expect([id, out[id]]).toEqual([id, 'object']);
    });

    test('modules resolve from the function\'s own folder (like a deployment package)', async () => {
        const dir = path.join(root, 'local-modules');
        fs.mkdirSync(path.join(dir, 'node_modules', 'greeting-lib'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'node_modules', 'greeting-lib', 'index.js'), "module.exports = 'hello from the bundle';");
        fs.writeFileSync(path.join(dir, 'helper.js'), "module.exports = () => 'relative require works';");
        fs.writeFileSync(path.join(dir, 'hook.js'), hookSource('viewer-request', `
            out.lib = require('greeting-lib');
            out.helper = require('./helper')();`));
        expect(await report(dir, 'viewer-request')).toEqual({ lib: 'hello from the bundle', helper: 'relative require works' });
    });

    test('the AWS SDK v3 is available even when not bundled (Lambda\'s Node.js runtimes include it)', async () => {
        const dir = path.join(root, 'sdk');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'hook.js'), hookSource('origin-request', `
            out.s3 = typeof require('@aws-sdk/client-s3').S3Client;`));
        expect(await report(dir, 'origin-request')).toEqual({ s3: 'function' });
    });

    test('a module that doesn\'t exist fails like in AWS', async () => {
        const dir = path.join(root, 'missing');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'hook.js'), hookSource('viewer-request', `
            try { require('definitely-not-installed'); out.result = 'loaded'; } catch (err) { out.result = err.code; }`));
        expect(await report(dir, 'viewer-request')).toEqual({ result: 'MODULE_NOT_FOUND' });
    });
});
