import crypto from 'crypto';
import fs from 'fs';
import { createRequire } from 'module';
import net from 'net';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * The Lambda@Edge execution environment, as AWS documents it ("Differences between CloudFront
 * Functions and Lambda@Edge"): network access and file system access in every event, any module
 * the function bundles, and only reserved environment variables.
 *
 * Two Lambda realities are simulated, because code that ignores them works locally and fails in AWS:
 * - The file system is read-only except `/tmp`, and only files in the deployment package exist.
 *   `/tmp` is mapped to a per-project folder so hooks can't clobber the host's `/tmp`.
 * - Lambda@Edge can't reach private networks or your machine, so connecting to localhost or a
 *   private address warns (it still works, so LocalStack/MinIO setups keep running).
 *
 * The checks apply to modules the function requires itself; libraries it loads use Node directly.
 */

export interface SandboxContext {
    /** The function file; relative paths resolve from its folder (Lambda's task root). */
    hookFile: string;
    /** Files outside this folder (and node_modules) wouldn't be in the deployment package. */
    projectDir: string;
    /** Where `/tmp` really lives on this machine. */
    tmpDir: string;
    /** Reports a fidelity warning (each distinct message once). */
    warn: (message: string) => void;
}

const hostRequire = require;

export function sandboxTmpDir(projectDir: string): string {
    const id = crypto.createHash('sha1').update(projectDir).digest('hex').slice(0, 10);
    return path.join(os.tmpdir(), 'cloudfrontize', id, 'tmp');
}

const inside = (root: string, target: string) => target === root || target.startsWith(root + path.sep);

// ---------- Network ----------

/** True for addresses a function running in AWS can't reach: your machine and private networks. */
export function isUnreachableFromAws(rawHost: string | undefined): boolean {
    if (!rawHost) return false;
    let host = String(rawHost).toLowerCase().trim();
    if (host.startsWith('[')) host = host.slice(1, host.indexOf(']'));
    if (net.isIP(host) !== 6 && host.includes(':')) host = host.split(':')[0];
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === '0.0.0.0') return true;
    if (net.isIPv4(host)) {
        const [a, b] = host.split('.').map(Number);
        return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
    }
    if (net.isIPv6(host)) return host === '::1' || /^f[cd]/.test(host) || /^fe[89ab]/.test(host);
    return false;
}

const hostOf = (target: any): string | undefined => {
    try {
        if (typeof target === 'string') return new URL(target).hostname;
        if (target instanceof URL) return target.hostname;
        if (target && typeof target === 'object') return target.hostname || target.host || (target.url ? new URL(target.url).hostname : undefined);
    } catch { /* not a URL */ }
    return undefined;
};

function networkWarning(ctx: SandboxContext, host: string | undefined) {
    if (isUnreachableFromAws(host)) {
        ctx.warn(`${path.basename(ctx.hookFile)} connects to ${host}, which isn't reachable from AWS Lambda@Edge (it can't access your machine, private networks or VPC resources)`);
    }
}

function wrapNetModule(real: any, kind: 'http' | 'net', ctx: SandboxContext) {
    const names = kind === 'http' ? ['request', 'get'] : ['connect', 'createConnection'];
    return new Proxy(real, {
        get(target, prop) {
            const value = target[prop];
            if (typeof prop === 'string' && names.includes(prop) && typeof value === 'function') {
                return (...args: any[]) => {
                    const first = args[0];
                    const host = kind === 'http'
                        ? hostOf(first)
                        : (typeof first === 'object' && first ? first.host : (typeof args[1] === 'string' ? args[1] : 'localhost'));
                    networkWarning(ctx, host);
                    return value.apply(target, args);
                };
            }
            return value;
        }
    });
}

export function wrapFetch(ctx: SandboxContext): typeof fetch {
    return ((input: any, init?: any) => {
        networkWarning(ctx, hostOf(input));
        return fetch(input, init);
    }) as typeof fetch;
}

// ---------- File system ----------

// Operations whose first path argument is written
const WRITE_OPS = new Set(['writeFile', 'appendFile', 'mkdir', 'rm', 'rmdir', 'unlink', 'truncate', 'chmod', 'chown', 'lchown', 'lchmod', 'utimes', 'lutimes', 'mkdtemp', 'createWriteStream']);
// Operations with two paths: [source, destination]; which ones are written
const TWO_PATH_OPS: Record<string, { read: number[]; write: number[] }> = {
    rename: { read: [], write: [0, 1] },
    copyFile: { read: [0], write: [1] },
    cp: { read: [0], write: [1] },
    link: { read: [0], write: [1] },
    symlink: { read: [], write: [1] }
};
const READ_OPS = new Set(['readFile', 'readdir', 'stat', 'lstat', 'exists', 'access', 'createReadStream', 'realpath', 'readlink', 'opendir', 'statfs']);

const isWriteFlag = (flags: any) =>
    typeof flags === 'string' ? /[wa+]/.test(flags)
        : typeof flags === 'number' ? (flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_APPEND | fs.constants.O_TRUNC)) !== 0
            : false;

function erofs(syscall: string, target: string) {
    return Object.assign(new Error(`EROFS: read-only file system, ${syscall} '${target}'`), { code: 'EROFS', errno: -30, syscall, path: target });
}

export function createLambdaFs(ctx: SandboxContext) {
    const taskRoot = path.dirname(ctx.hookFile);
    let tmpReady = false;

    /** Maps a path argument: `/tmp/...` → the sandbox folder; relative paths → the task root. */
    const mapPath = (arg: any): { mapped: any; abs?: string; shown?: string } => {
        let p = arg;
        if (p instanceof URL) p = fileURLToPath(p);
        if (Buffer.isBuffer(p)) p = p.toString();
        if (typeof p !== 'string') return { mapped: arg }; // a file descriptor
        if (p === '/tmp' || p.startsWith('/tmp/')) {
            if (!tmpReady) { fs.mkdirSync(ctx.tmpDir, { recursive: true }); tmpReady = true; }
            const abs = path.join(ctx.tmpDir, p.slice('/tmp'.length));
            return { mapped: abs, abs, shown: p };
        }
        const abs = path.resolve(taskRoot, p);
        return { mapped: abs, abs, shown: p };
    };

    const writable = (abs: string) => inside(ctx.tmpDir, abs);
    const packaged = (abs: string) => inside(ctx.projectDir, abs) || inside(ctx.tmpDir, abs) || abs.includes(`${path.sep}node_modules${path.sep}`);

    const wrap = (real: any, name: string, flavor: 'sync' | 'callback' | 'promise') => {
        const base = name.replace(/Sync$/, '');
        return function (this: any, ...args: any[]) {
            const two = TWO_PATH_OPS[base];
            const pathIndexes = two ? [0, 1] : [0];
            const shown: Record<number, string> = {};
            for (const i of pathIndexes) {
                if (i >= args.length) continue;
                const { mapped, abs, shown: s } = mapPath(args[i]);
                args[i] = mapped;
                if (abs) shown[i] = s!;
            }

            const writes = two ? two.write
                : WRITE_OPS.has(base) || (base === 'open' && isWriteFlag(args[1])) ? [0] : [];
            const reads = two ? two.read : (READ_OPS.has(base) || base === 'open') && !writes.length ? [0] : [];

            for (const i of writes) {
                if (typeof args[i] === 'string' && !writable(args[i])) {
                    const err = erofs(base, shown[i] ?? args[i]);
                    if (flavor === 'promise') return Promise.reject(err);
                    const callback = args[args.length - 1];
                    if (flavor === 'callback' && typeof callback === 'function') { process.nextTick(callback, err); return; }
                    throw err;
                }
            }
            for (const i of reads) {
                if (typeof args[i] === 'string' && !packaged(args[i])) {
                    ctx.warn(`${path.basename(ctx.hookFile)} reads ${shown[i] ?? args[i]}, which isn't inside the project, so it wouldn't be in the deployment package`);
                }
            }
            return real.apply(this, args);
        };
    };

    const known = (name: string) => {
        const base = name.replace(/Sync$/, '');
        return WRITE_OPS.has(base) || READ_OPS.has(base) || base in TWO_PATH_OPS || base === 'open';
    };

    const proxy = (target: any, flavor: (name: string) => 'sync' | 'callback' | 'promise', promises?: any) => {
        const cache = new Map<string, any>();
        return new Proxy(target, {
            get(t, prop) {
                if (prop === 'promises' && promises) return promises;
                const value = t[prop];
                if (typeof prop !== 'string' || typeof value !== 'function' || !known(prop)) return value;
                if (!cache.has(prop)) cache.set(prop, wrap(value, prop, flavor(prop)));
                return cache.get(prop);
            }
        });
    };

    const promises = proxy(fs.promises, () => 'promise');
    return {
        fs: proxy(fs, name => (name.endsWith('Sync') || name.startsWith('create') ? 'sync' : 'callback'), promises),
        promises
    };
}

// ---------- require ----------

/**
 * `require` for a Lambda@Edge function: modules resolve from the function's folder (as from a
 * deployment package), with the AWS SDK v3 also available as in Lambda's Node.js runtimes. Every
 * module is allowed, as in AWS; `fs`, `http(s)`, `net` and `tls` get the checks described above.
 */
export function createLambdaRequire(ctx: SandboxContext) {
    const localRequire = createRequire(ctx.hookFile);
    const lambdaFs = createLambdaFs(ctx);
    const special: Record<string, () => any> = {
        fs: () => lambdaFs.fs,
        'fs/promises': () => lambdaFs.promises,
        http: () => wrapNetModule(hostRequire('http'), 'http', ctx),
        https: () => wrapNetModule(hostRequire('https'), 'http', ctx),
        net: () => wrapNetModule(hostRequire('net'), 'net', ctx),
        tls: () => wrapNetModule(hostRequire('tls'), 'net', ctx)
    };
    const loaded = new Map<string, any>();

    return (id: string) => {
        const name = id.startsWith('node:') ? id.slice(5) : id;
        if (special[name]) {
            if (!loaded.has(name)) loaded.set(name, special[name]());
            return loaded.get(name);
        }
        try {
            return localRequire(id);
        } catch (err: any) {
            // "The Node.js runtimes include the AWS SDK for JavaScript v3": fall back to the bundled SDK
            if (err?.code === 'MODULE_NOT_FOUND' && id.startsWith('@aws-sdk/')) return hostRequire(id);
            throw err;
        }
    };
}

/** A Lambda-like `process`: reserved environment variables only, Linux x64, no way to stop the emulator. */
export function createLambdaProcess(env: Record<string, string>, ctx: SandboxContext) {
    return {
        env,
        platform: 'linux',
        arch: 'x64',
        version: process.version,
        versions: process.versions,
        cwd: () => path.dirname(ctx.hookFile),
        hrtime: process.hrtime,
        memoryUsage: process.memoryUsage,
        uptime: process.uptime,
        nextTick: process.nextTick,
        emitWarning: (message: string) => ctx.warn(`${path.basename(ctx.hookFile)}: ${message}`),
        exit: () => { throw new Error('process.exit() would stop the Lambda runtime; return a response instead'); }
    };
}
