import nodeCrypto from 'crypto';
import querystring from 'querystring';
import vm from 'vm';
import * as acorn from 'acorn';
import type { KeyValueStore } from '../KeyValueStore';

/**
 * CloudFront Functions JavaScript runtime 2.0 ("JavaScript runtime 2.0 features").
 *
 * Execution model: the function runs in a fresh VM context with `microtaskMode: 'afterEvaluate'`,
 * so promise jobs run inside the same guarded evaluation. Everything async the function can await
 * (KeyValueStore reads) is created with the context's own Promise and resolves immediately, so a
 * handler settles before the evaluation returns, and the runaway guard covers async code too.
 */

/** Rewrites `import cf from 'cloudfront'` into a sandbox binding, keeping line numbers. */
export function rewriteImports(code: string): string {
    let ast: any;
    try {
        ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
    } catch {
        return code; // the validator reports syntax errors
    }
    let out = code;
    const imports = ast.body.filter((n: any) => n.type === 'ImportDeclaration' && n.source.value === 'cloudfront');
    for (const node of imports.reverse()) {
        const local = node.specifiers[0]?.local?.name || 'cf';
        const original = code.slice(node.start, node.end);
        const newlines = (original.match(/\n/g) || []).length;
        out = out.slice(0, node.start) + `const ${local} = __cloudfront__;` + '\n'.repeat(newlines) + out.slice(node.end);
    }
    return out;
}

/** Name of the host-provided loop guard injected into runtime 2.0 code. */
export const LOOP_GUARD = '__cfz_guard__';

const LOOP_TYPES = new Set(['WhileStatement', 'DoWhileStatement', 'ForStatement', 'ForInStatement', 'ForOfStatement']);

/**
 * Inserts a runaway check at the start of every loop body (on the same line, so line numbers in
 * errors don't move). The VM timeout can't safely stop code that runs after an `await`: terminating
 * inside the microtask phase crashes Node. The loop guard stops it from inside instead.
 */
export function instrumentLoops(code: string): string {
    let ast: any;
    try {
        ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
    } catch {
        return code; // the validator reports syntax errors
    }
    const inserts: { at: number; text: string }[] = [];
    const visit = (node: any) => {
        if (!node || typeof node.type !== 'string') return;
        if (LOOP_TYPES.has(node.type)) {
            const body = node.body;
            if (body.type === 'BlockStatement') inserts.push({ at: body.start + 1, text: `${LOOP_GUARD}();` });
            else {
                inserts.push({ at: body.start, text: `{${LOOP_GUARD}();` });
                inserts.push({ at: body.end, text: '}' });
            }
        }
        for (const key of Object.keys(node)) {
            const value = node[key];
            if (Array.isArray(value)) value.forEach(visit);
            else if (value && typeof value.type === 'string') visit(value);
        }
    };
    visit(ast);
    let out = code;
    for (const { at, text } of inserts.sort((a, b) => b.at - a.at)) out = out.slice(0, at) + text + out.slice(at);
    return out;
}

/** A per-run loop guard that throws once the run has used up `limitMs`. Checks the clock every 1024 iterations. */
export function createLoopGuard(limitMs: number, message: string) {
    const start = process.hrtime.bigint();
    let count = 0;
    return () => {
        if ((++count & 1023) !== 0) return;
        if (Number(process.hrtime.bigint() - start) / 1e6 > limitMs) throw Object.assign(new Error(message), { __runaway__: true });
    };
}

/** Wraps the function so its (possibly async) result is captured synchronously in `__done__`. */
export const RUNTIME2_TAIL = `
;(function () {
  try {
    var r = handler(event);
    if (r && typeof r.then === 'function') {
      r.then(function (v) { __done__.state = 'ok'; __done__.value = v; },
             function (e) { __done__.state = 'error'; __done__.error = e; });
    } else { __done__.state = 'ok'; __done__.value = r; }
  } catch (e) { __done__.state = 'error'; __done__.error = e; }
})();`;

/**
 * "All Date methods to query the current time always return the same value during the lifetime of
 * a single function run": `Date` is replaced with one frozen at the function's start time.
 */
export const FROZEN_DATE_PRELUDE = new vm.Script(`(function (start) {
  var RealDate = Date;
  function FrozenDate() {
    if (!(this instanceof FrozenDate)) return new RealDate(start).toString();
    if (arguments.length === 0) return new RealDate(start);
    var args = [null];
    for (var i = 0; i < arguments.length; i++) args.push(arguments[i]);
    return new (Function.prototype.bind.apply(RealDate, args))();
  }
  FrozenDate.prototype = RealDate.prototype;
  FrozenDate.now = function () { return start; };
  FrozenDate.UTC = RealDate.UTC;
  FrozenDate.parse = RealDate.parse;
  globalThis.Date = FrozenDate;
})(__startTime__);`, { filename: 'cloudfrontize:frozen-date' });

const HASH_ALGORITHMS = ['md5', 'sha1', 'sha256'];

/** `crypto` as documented for runtime 2.0: createHash / createHmac with md5, sha1, sha256. */
const cryptoModule = {
    createHash(algorithm: string) {
        if (!HASH_ALGORITHMS.includes(algorithm)) throw new Error(`crypto.createHash: unsupported algorithm "${algorithm}" (md5, sha1 or sha256)`);
        const hash = nodeCrypto.createHash(algorithm);
        return { update(data: any) { hash.update(data); return this; }, digest(encoding?: any) { return encoding ? hash.digest(encoding) : hash.digest(); } };
    },
    createHmac(algorithm: string, key: any) {
        if (!HASH_ALGORITHMS.includes(algorithm)) throw new Error(`crypto.createHmac: unsupported algorithm "${algorithm}" (md5, sha1 or sha256)`);
        const hmac = nodeCrypto.createHmac(algorithm, key);
        return { update(data: any) { hmac.update(data); return this; }, digest(encoding?: any) { return encoding ? hmac.digest(encoding) : hmac.digest(); } };
    }
};

const MODULES: Record<string, unknown> = {
    crypto: cryptoModule,
    querystring,
    buffer: { Buffer }
};

/** Globals available to runtime 2.0 functions (beyond the context's own JS built-ins). */
export function runtime2Globals(console: { log: (...args: any[]) => void }) {
    return {
        console: { log: console.log },
        Buffer,
        TextEncoder,
        TextDecoder,
        atob,
        btoa,
        require: (id: string) => {
            if (!(id in MODULES)) throw new Error(`Cannot find module '${id}' (CloudFront Functions runtime 2.0 provides crypto, querystring and buffer)`);
            return MODULES[id];
        }
    };
}

/**
 * The `cloudfront` module (KeyValueStore helpers). `cf.kvs()` returns the store associated with
 * the function; every method returns a promise of the context's realm that's already settled.
 */
export function cloudfrontModule(context: vm.Context, store: KeyValueStore | undefined) {
    const CtxPromise = vm.runInContext('Promise', context) as PromiseConstructor;
    const resolve = <T>(value: T) => CtxPromise.resolve(value);
    const reject = (message: string) => CtxPromise.reject(new (vm.runInContext('Error', context))(message));

    return {
        kvs(_id?: string) {
            if (!store) throw new Error('No key value store is associated with this function (set "keyValueStore" in cloudfrontize.json)');
            return {
                get(key: string, options?: { format?: 'string' | 'json' | 'bytes' }) {
                    const value = store.get(String(key));
                    if (value === undefined) return reject(`Key not found: ${key}`);
                    const format = options?.format ?? 'string';
                    if (format === 'json') {
                        try { return resolve(JSON.parse(value)); } catch (err: any) { return reject(`Value of "${key}" is not valid JSON: ${err.message}`); }
                    }
                    if (format === 'bytes') return resolve(Buffer.from(value, 'utf8'));
                    return resolve(value);
                },
                exists(key: string) {
                    return resolve(store.has(String(key)));
                },
                meta() {
                    return resolve(store.meta());
                }
            };
        }
    };
}
