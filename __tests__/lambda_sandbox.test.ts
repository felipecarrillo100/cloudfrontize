export {};
const { EdgeRunner } = require('../src/edgeRunner');
const { sandboxTmpDir, isUnreachableFromAws } = require('../src/core/lambda/sandbox');
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Lambda's real limits, in every Lambda@Edge event: the file system is read-only except /tmp, only
 * files in the deployment package exist, the function can't reach your machine or private networks,
 * and only reserved environment variables exist.
 */
const EVENTS = ['viewer-request', 'origin-request', 'origin-response', 'viewer-response'];

describe('Lambda@Edge sandbox (Lambda\'s real environment)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cfz-sandbox-'));
    const outsideFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cfz-outside-')), 'secret.txt');
    let warnSpy: any;

    beforeAll(() => {
        fs.writeFileSync(outsideFile, 'not in the bundle');
        process.env.CFZ_HOST_ONLY_SECRET = 'leaked';
    });
    beforeEach(() => { warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {}); });
    afterEach(() => warnSpy.mockRestore());
    afterAll(() => {
        delete process.env.CFZ_HOST_ONLY_SECRET;
        fs.rmSync(root, { recursive: true, force: true });
        fs.rmSync(path.dirname(outsideFile), { recursive: true, force: true });
    });

    const run = async (event: string, body: string) => {
        const dir = path.join(root, `${event}-${Math.random().toString(36).slice(2)}`);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'hook.js'), `
            exports.hookType = '${event}';
            exports.handler = async (e) => {
                const cf = e.Records[0].cf;
                const target = cf.response || cf.request;
                const out = {};
                ${body}
                target.headers['x-report'] = [{ key: 'X-Report', value: JSON.stringify(out) }];
                return target;
            };`);
        const runner = new EdgeRunner(dir, { watch: false });
        runner.load();
        try {
            const { result } = event.endsWith('request')
                ? await runner.runRequestHook({ url: '/', headers: {} })
                : await runner.runResponseHook({ url: '/', headers: {} }, { status: 200, headers: {} }, 'test', event);
            return { out: JSON.parse(result.headers['x-report'][0].value), dir };
        } finally {
            runner.close();
        }
    };

    test.each(EVENTS)('%s: writing outside /tmp fails with EROFS (sync, callback and promise APIs)', async (event) => {
        const { out } = await run(event, `
            const fs = require('fs');
            try { fs.writeFileSync('./cache.json', '{}'); out.sync = 'written'; } catch (err) { out.sync = err.code; }
            out.callback = await new Promise(resolve => fs.writeFile('./cache.json', '{}', err => resolve(err ? err.code : 'written')));
            try { await require('fs/promises').mkdir('./data'); out.promise = 'created'; } catch (err) { out.promise = err.code; }`);
        expect(out).toEqual({ sync: 'EROFS', callback: 'EROFS', promise: 'EROFS' });
    });

    test.each(EVENTS)('%s: /tmp is writable, and lands in a sandbox folder, not the host /tmp', async (event) => {
        const name = `cfz-${event}-${Date.now()}.txt`;
        const { out, dir } = await run(event, `
            const fs = require('fs');
            fs.writeFileSync('/tmp/${name}', 'scratch');
            out.read = fs.readFileSync('/tmp/${name}', 'utf8');
            out.exists = fs.existsSync('/tmp/${name}');`);
        expect(out).toEqual({ read: 'scratch', exists: true });
        expect(fs.existsSync(path.join(sandboxTmpDir(dir), name))).toBe(true);
        expect(fs.existsSync(path.join('/tmp', name))).toBe(false);
    });

    test.each(EVENTS)('%s: reading a file outside the project warns (it wouldn\'t be bundled)', async (event) => {
        const { out } = await run(event, `out.content = require('fs').readFileSync(${JSON.stringify(outsideFile)}, 'utf8');`);
        expect(out.content).toBe('not in the bundle');
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("wouldn't be in the deployment package"));
    });

    test.each(EVENTS)('%s: connecting to localhost warns (AWS can\'t reach your machine)', async (event) => {
        await run(event, `
            const req = require('http').get('http://localhost:9/');
            req.on('error', () => {});
            await fetch('http://192.168.1.10:9/').catch(() => {});`);
        const messages = warnSpy.mock.calls.map((c: any[]) => String(c[0])).join('\n');
        expect(messages).toContain("connects to localhost, which isn't reachable from AWS Lambda@Edge");
        expect(messages).toContain("connects to 192.168.1.10");
    });

    test.each(EVENTS)('%s: the host\'s environment variables aren\'t visible', async (event) => {
        const { out } = await run(event, `
            out.secret = process.env.CFZ_HOST_ONLY_SECRET ?? null;
            out.region = process.env.AWS_REGION;
            out.runtime = process.env.AWS_EXECUTION_ENV;
            out.platform = process.platform;`);
        expect(out).toEqual({ secret: null, region: 'us-east-1', runtime: 'AWS_Lambda_nodejs22.x', platform: 'linux' });
    });

    test('public addresses are reachable; local and private ones aren\'t', () => {
        for (const host of ['localhost', '127.0.0.1', '10.0.0.5', '172.20.1.1', '192.168.0.1', '169.254.169.254', '::1', 'fd00::1', 'printer.local', '[::1]'])
            expect([host, isUnreachableFromAws(host)]).toEqual([host, true]);
        for (const host of ['example.com', '8.8.8.8', '172.32.0.1', 's3.amazonaws.com'])
            expect([host, isUnreachableFromAws(host)]).toEqual([host, false]);
    });
});
