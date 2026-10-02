export {};
const request = require('supertest');
const { CFFValidator } = require('../src/core/CFFValidator');
const { CFFRunner } = require('../src/core/CFFRunner');
const { createServer } = require('../src/server/createServer');
const { loadProject } = require('../src/project/loadProject');
const { ManifestError } = require('../src/project/errors');
const { makeProject, removeProject, baseManifest, WWW } = require('./helpers/projectFixture');

// Sources: "JavaScript runtime 2.0 features for CloudFront Functions", "Helper methods for key value stores"
const v2 = (code: string) => new CFFValidator().validate('fn.js', code, 'cloudfront-js-2.0');
const errors = (code: string) => v2(code).violations.filter((x: any) => x.level === 'error').map((x: any) => x.message);
const warnings = (code: string) => v2(code).violations.filter((x: any) => x.level === 'warn').map((x: any) => x.message);

describe('CloudFront Functions runtime 2.0: validator', () => {
    test('accepts documented ES6+ features', () => {
        const code = `
            import cf from 'cloudfront';
            const crypto = require('crypto');
            async function handler(event) {
                const req = event.request;
                let tag = \`v\${2 ** 3}\`;
                const add = (...xs) => xs.reduce((a, b) => a + b, 0);
                req.headers['x-tag'] = { value: tag + add(1, 2) };
                return req;
            }`;
        expect(v2(code)).toEqual({ valid: true, violations: [] });
    });

    test.each([
        ['eval', 'function handler(e) { eval("1"); return e.request; }', 'eval() is not supported'],
        ['new Function', 'function handler(e) { new Function("return 1"); return e.request; }', 'Function constructors are not supported'],
        ['timers', 'function handler(e) { setTimeout(function () {}, 1); return e.request; }', 'setTimeout() is not supported'],
        ['require fs', 'const fs = require("fs"); function handler(e) { return e.request; }', "require() only supports"],
        ['import other', 'import x from "lodash"; function handler(e) { return e.request; }', "Only the 'cloudfront' module"],
        ['export', 'export function handler(e) { return e.request; }', "don't export anything"],
        ['missing handler', 'function main(e) { return e.request; }', 'Define a top-level function named handler']
    ])('rejects %s', (_name, code, message) => {
        expect(errors(code).join('\n')).toContain(message);
    });

    test.each([
        ['class', 'class A {} function handler(e) { return e.request; }', 'class'],
        ['console comma syntax', 'function handler(e) { console.log("a", "b"); return e.request; }', 'comma syntax'],
        ['console.error', 'function handler(e) { console.error("x"); return e.request; }', 'only support console.log'],
        ['destructuring', 'function handler(e) { const { request } = e; return request; }', 'destructuring']
    ])('warns about %s (not listed as supported)', (_name, code, message) => {
        expect(warnings(code).join('\n')).toContain(message);
        expect(v2(code).valid).toBe(true);
    });
});

describe('CloudFront Functions runtime 2.0: execution', () => {
    const dirs: string[] = [];
    const servers: any[] = [];

    beforeAll(() => {
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(async () => {
        while (servers.length) await servers.pop().closeGracefully();
        while (dirs.length) removeProject(dirs.pop()!);
    });
    afterAll(() => jest.restoreAllMocks());

    // A project with one runtime 2.0 viewer-request function and an optional key value store
    const serve = async (code: string, opts: { kvs?: object; strict?: boolean } = {}) => {
        const dir = makeProject(baseManifest({
            distribution: { strict: !!opts.strict },
            functions: { fn: { type: 'cloudfront-function', runtime: 'cloudfront-js-2.0', file: 'fn.js', ...(opts.kvs ? { keyValueStore: 'store' } : {}) } },
            ...(opts.kvs ? { keyValueStores: { store: { file: 'kvs.json' } } } : {}),
            defaultBehavior: { origin: 'web', functions: { 'viewer-request': 'fn' } }
        }), { ...WWW, 'fn.js': code, ...(opts.kvs ? { 'kvs.json': JSON.stringify(opts.kvs) } : {}) });
        dirs.push(dir);
        const server = await createServer({ project: dir, port: 0, noBanner: true });
        servers.push(server);
        return server;
    };
    // The function answers with a JSON body built from what it computed
    const respond = (expr: string) => `import cf from 'cloudfront';
    async function handler(event) {
        const out = await (async () => (${expr}))();
        return { statusCode: 200, statusDescription: 'OK', headers: {}, body: JSON.stringify(out) };
    }`;
    const run = async (expr: string, opts?: any) => JSON.parse((await request(await serve(respond(expr), opts)).get('/')).text);

    test('async handlers are awaited', async () => {
        const server = await serve(`async function handler(event) {
            const value = await Promise.resolve('awaited');
            event.request.uri = '/index.html';
            event.request.headers['x-v'] = { value };
            return { statusCode: 200, statusDescription: 'OK', headers: { 'x-v': { value } }, body: 'ok' };
        }`);
        const res = await request(server).get('/');
        expect(res.status).toBe(200);
        expect(res.headers['x-v']).toBe('awaited');
    });

    test('crypto: createHash and createHmac with md5/sha1/sha256', async () => {
        const out = await run(`({ sha: require('crypto').createHash('sha256').update('abc').digest('hex'),
                                  hmac: require('crypto').createHmac('sha1', 'k').update('abc').digest('base64') })`);
        expect(out.sha).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
        expect(typeof out.hmac).toBe('string');
    });

    test('crypto refuses other algorithms', async () => {
        const out = await run(`(() => { try { require('crypto').createHash('sha512'); return 'allowed'; } catch (e) { return e.message; } })()`);
        expect(out).toContain('unsupported algorithm');
    });

    test('querystring, Buffer, atob/btoa and TextEncoder are available', async () => {
        const out = await run(`({ qs: require('querystring').parse('a=1&a=2&b=3'), b64: Buffer.from('hi').toString('base64'),
                                  roundtrip: atob(btoa('ok')), bytes: new TextEncoder().encode('ab').length })`);
        expect(out).toEqual({ qs: { a: ['1', '2'], b: '3' }, b64: 'aGk=', roundtrip: 'ok', bytes: 2 });
    });

    test('Date is frozen at the function start time', async () => {
        const out = await run(`(() => { const a = Date.now(); let x = 0; for (let i = 0; i < 1e6; i++) x += i; return { same: a === Date.now() && a === new Date().getTime(), parsed: new Date(0).getTime() }; })()`);
        expect(out).toEqual({ same: true, parsed: 0 });
    });

    test('runaway code after an await is stopped by the guard', async () => {
        const server = await serve('async function handler(event) { await Promise.resolve(); while (true) {} }');
        const res = await request(server).get('/');
        expect(res.status).toBe(503);
        expect(res.text).toContain('FunctionExecutionError');
    }, 15000);

    test('a promise that never settles is an execution error (503 under strict)', async () => {
        const server = await serve('async function handler(event) { await new Promise(function () {}); return event.request; }', { strict: true });
        const res = await request(server).get('/');
        expect(res.status).toBe(503);
        expect(res.text).toContain('never settled');
    });

    describe('KeyValueStore', () => {
        const data = { data: [
            { key: 'greeting', value: 'hello' },
            { key: 'config', value: '{"enabled":true,"ratio":0.5}' }
        ] };

        test('get() in string, json and bytes formats', async () => {
            const out = await run(`(async () => { const kvs = cf.kvs();
                return { s: await kvs.get('greeting'), j: await kvs.get('config', { format: 'json' }), b: (await kvs.get('greeting', { format: 'bytes' })).length }; })()`
                .replace('(async', 'await (async'), { kvs: data });
            expect(out).toEqual({ s: 'hello', j: { enabled: true, ratio: 0.5 }, b: 5 });
        });

        test('get() rejects for a missing key; exists() and meta() work', async () => {
            const out = await run(`(async () => { const kvs = cf.kvs();
                let missing; try { await kvs.get('nope'); missing = 'found'; } catch (e) { missing = e.message; }
                const meta = await kvs.meta();
                return { missing, exists: await kvs.exists('greeting'), absent: await kvs.exists('nope'), keyCount: meta.keyCount }; })()`
                .replace('(async', 'await (async'), { kvs: data });
            expect(out).toEqual({ missing: 'Key not found: nope', exists: true, absent: false, keyCount: 2 });
        });
    });
});

// The function source needs `import cf from 'cloudfront'` for the KeyValueStore tests
const withImport = (code: string) => `import cf from 'cloudfront';\n${code}`;
describe('CloudFront Functions runtime 2.0: KeyValueStore in practice', () => {
    let dir: string;
    let server: any;
    beforeAll(async () => {
        jest.spyOn(console, 'log').mockImplementation(() => {});
        dir = makeProject(baseManifest({
            functions: { redirect: { type: 'cloudfront-function', runtime: 'cloudfront-js-2.0', file: 'redirect.js', keyValueStore: 'paths' } },
            keyValueStores: { paths: { file: 'paths.json' } },
            defaultBehavior: { origin: 'web', functions: { 'viewer-request': 'redirect' } }
        }), {
            ...WWW,
            'paths.json': JSON.stringify({ data: [{ key: '/old', value: '/index.html' }] }),
            'redirect.js': withImport(`async function handler(event) {
                const kvs = cf.kvs();
                const uri = event.request.uri;
                if (await kvs.exists(uri)) {
                    return { statusCode: 301, statusDescription: 'Moved', headers: { location: { value: await kvs.get(uri) } } };
                }
                return event.request;
            }`)
        });
        server = await createServer({ project: dir, port: 0, noBanner: true });
    });
    afterAll(async () => {
        await server.closeGracefully();
        removeProject(dir);
        jest.restoreAllMocks();
    });

    test('editing the store file takes effect without a restart', async () => {
        const fs = require('fs');
        const file = require('path').join(dir, 'paths.json');
        fs.writeFileSync(file, JSON.stringify({ data: [{ key: '/old', value: '/index.html' }, { key: '/new', value: '/index.html' }] }));
        let status = 0;
        for (let i = 0; i < 150 && status !== 301; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            status = (await request(server).get('/new')).status;
        }
        expect(status).toBe(301);
    }, 20000);

    test('redirects driven by the store', async () => {
        const res = await request(server).get('/old');
        expect(res.status).toBe(301);
        expect(res.headers.location).toBe('/index.html');
        expect((await request(server).get('/index.html')).status).toBe(200);
    });
});

describe('CloudFront Functions runtime 2.0: manifest rules for key value stores', () => {
    const diagnose = (extra: any, kvs: any, runtime = 'cloudfront-js-2.0') => {
        const dir = makeProject(baseManifest({
            ...extra,
            functions: { fn: { type: 'cloudfront-function', runtime, file: 'fn.js', keyValueStore: 'store' } },
            keyValueStores: { store: { file: 'kvs.json' } },
            defaultBehavior: { origin: 'web', functions: { 'viewer-request': 'fn' } }
        }), { ...WWW, 'fn.js': 'function handler(e) { return e.request; }', 'kvs.json': JSON.stringify(kvs) });
        try { return loadProject(dir).diagnostics; } catch (err: any) { if (err instanceof ManifestError) return err.diagnostics; throw err; } finally { removeProject(dir); }
    };

    test('key value stores require runtime 2.0', () => {
        const d = diagnose({}, { data: [] }, 'cloudfront-js-1.0');
        expect(d.find((x: any) => x.rule === 'kvs-runtime')).toMatchObject({ severity: 'error', path: '/functions/fn/keyValueStore' });
    });

    test('duplicate keys and a wrong format are errors', () => {
        expect(diagnose({}, { data: [{ key: 'a', value: '1' }, { key: 'a', value: '2' }] }).find((x: any) => x.message.includes('duplicate key'))).toBeTruthy();
        expect(diagnose({}, { items: [] }).find((x: any) => x.message.includes('AWS format'))).toBeTruthy();
    });

    test('a value over 1024 characters warns, and is an error under strict', () => {
        const big = { data: [{ key: 'k', value: 'x'.repeat(1025) }] };
        expect(diagnose({}, big).find((x: any) => x.rule === 'kvs-file').severity).toBe('warning');
        expect(diagnose({ distribution: { strict: true } }, big).find((x: any) => x.rule === 'kvs-file').severity).toBe('error');
    });
});

describe('CloudFront Functions event structure', () => {
    const runner = new CFFRunner(null, {});

    test('querystring: first value in `value`, `multiValue` only for repeated names', () => {
        const event = runner.toCFFEvent({ method: 'GET', url: '/?a=1&a=2&b=3', headers: {} }, null, 'viewer-request');
        expect(event.request.querystring.a).toEqual({ value: '1', multiValue: [{ value: '1' }, { value: '2' }] });
        expect(event.request.querystring.b).toEqual({ value: '3' });
    });

    test('request cookies are in `cookies`, not `headers`, and changes rebuild the Cookie header', () => {
        const event = runner.toCFFEvent({ method: 'GET', url: '/', headers: { cookie: 'a=1; b=2' } }, null, 'viewer-request');
        expect(event.request.headers.cookie).toBeUndefined();
        expect(event.request.cookies).toEqual({ a: { value: '1' }, b: { value: '2' } });

        event.request.cookies.b = { value: 'changed' };
        const back = runner.fromCFFEvent(event.request);
        expect(back.headers.cookie).toEqual([{ key: 'Cookie', value: 'a=1; b=changed' }]);
        expect(back.headers['set-cookie']).toBeUndefined();
    });

    test('response Set-Cookie headers become cookies with attributes', () => {
        const event = runner.toCFFEvent({ method: 'GET', url: '/', headers: {} }, { status: 200, headers: { 'set-cookie': ['id=1; Path=/; Secure'] } }, 'viewer-response');
        expect(event.response.headers['set-cookie']).toBeUndefined();
        expect(event.response.cookies.id).toEqual({ value: '1', attributes: 'Path=/; Secure' });
    });
});
