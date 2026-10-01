import fs from 'fs';
import path from 'path';
import vm from 'vm';
import * as acorn from 'acorn';
import { HotRunner } from './HotRunner';
import { FileOverride, Registry, RunnerOptions, HookType } from './types';
import { CFFValidator } from './CFFValidator';
import { EdgeError } from './EdgeError';
import { KeyValueStore } from './KeyValueStore';
import { CFFRuntime } from './CFFValidator';
import { FROZEN_DATE_PRELUDE, LOOP_GUARD, RUNTIME2_TAIL, cloudfrontModule, createLoopGuard, instrumentLoops, rewriteImports, runtime2Globals } from './cff2/runtime2';
import { HeaderManager } from './HeaderManager';
import { CodeProcessor } from './CodeProcessor';
import { SnippetExtractor } from './SnippetExtractor';
import { CFF_LIMITS, AWS_HEADERS } from '../constants';
import { HookUtility } from './HookUtility';

// Enforced guard for runaway functions (e.g. `while (true)`): without it a single CFF blocks the whole
// process, including load-time warmup. It's set far above AWS's limit so slow local hardware never
// trips it; the 1ms reference limit only warns. Calibration uses the same options so overhead stays accurate.
const CFF_VM_OPTIONS = { timeout: CFF_LIMITS.RUNAWAY_GUARD_MS };
// Runtime 2.0: loops are stopped by the injected loop guard at RUNAWAY_GUARD_MS; the VM timeout is
// only a backstop, set later so it doesn't fire while async continuations run (that crashes Node).
const CFF2_VM_OPTIONS = { timeout: CFF_LIMITS.RUNAWAY_GUARD_MS * 2 };

/**
 * A ultra-low-latency runtime for AWS CloudFront Functions (CFF).
 * 
 * @namespace Backend
 * The CFFRunner executes JavaScript code within a highly restricted ES5.1 sandbox.
 * It emulates the CloudFront Function event object and enforces AWS performance
 * constraints (e.g., sub-millisecond execution).
 * 
 * It includes a `CFFValidator` to catch ES5+ syntax violations before execution,
 * ensuring production compatibility.
 * 
 * @see {@link https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-functions.html | AWS CloudFront Functions}
 */
/**
 * "Function logs in CloudFront Functions are truncated at 10 KB" (Restrictions on CloudFront
 * Functions): one invocation's log messages, up to 10 KB of text (UTF-8); the message that crosses
 * the limit is cut, later ones are dropped, and a last line says so.
 */
export function truncateLogs(entries: Array<{ level: string; args: any[]; ts: number }>, limit = CFF_LIMITS.MAX_LOG_BYTES): Array<{ level: string; message: string; ts: number }> {
    const messages = entries.map(e => ({ level: e.level, ts: e.ts, message: e.args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') }));
    const sizes = messages.map(m => Buffer.byteLength(m.message));
    const out: typeof messages = [];
    let used = 0;
    for (let i = 0; i < messages.length; i++) {
        if (used + sizes[i] <= limit) {
            out.push(messages[i]);
            used += sizes[i];
            continue;
        }
        // Cut at a character boundary within the remaining bytes
        const rest = Buffer.from(messages[i].message).subarray(0, limit - used).toString('utf8').replace(/\uFFFD$/, '');
        if (rest) out.push({ ...messages[i], message: rest });
        const total = sizes.reduce((n, b) => n + b, 0);
        out.push({ level: 'warn', ts: messages[i].ts, message: `[CloudFrontize] Function logs truncated at 10 KB, as in CloudFront (this run logged ${(total / 1024).toFixed(1)} KB)` });
        break;
    }
    return out;
}

export class CFFRunner extends HotRunner {
    /** KeyValueStores by file, shared by the functions that use them; reloaded with the functions. */
    private stores = new Map<string, KeyValueStore>();
    private headerManager = new HeaderManager();
    private validator: CFFValidator;
    private compileError: string | null = null;
    private static CFF_OVERHEAD_MS: number = -1;

    /**
     * Initializes the CFFRunner with a path to a single JS file or directory of functions.
     * @param sourcePath - Absolute path to the CFF function(s).
     * @param options - Execution options (strict mode, environment paths, etc).
     */
    constructor(sourcePath: string | null, options: RunnerOptions = {}) {
        super(sourcePath, options);
        this.validator = new CFFValidator({ strict: !!options.strict });
        CFFRunner._calculateOverhead();
    }

    private static _calculateOverhead() {
        if (this.CFF_OVERHEAD_MS !== -1) return;
        const noopCode = 'function handler(event) { return event.request; } handler(event);';
        const noopScript = new vm.Script(noopCode);
        
        let total = 0;
        const runs = 20;
        
        for (let i = 0; i < runs; i++) {
            // Clinical Fidelity: Calibrate with the same VM options as the hot-path
            const sandbox = { 
                event: { request: {}, context: { requestId: 'warmup' } }, 
                console: {
                    log: () => {}, error: () => {}, warn: () => {}, info: () => {}
                },
                Math, JSON, Object, String, Array, Number, Date,
                Buffer: undefined, process: undefined, require: undefined
            };
            const context = vm.createContext(sandbox);
            
            const start = process.hrtime.bigint();
            noopScript.runInContext(context, CFF_VM_OPTIONS);
            const end = process.hrtime.bigint();
            total += Number(end - start) / 1e6;
        }
        this.CFF_OVERHEAD_MS = total / runs;
    }

    public load(changedFile?: string): void {
        this.bakeVars = this._loadBake(this.options.bakePath);

        if (changedFile && this.options.verbose) {
            console.log(`\x1b[36m🔄 [CFF] Hot-Reload triggered by: ${changedFile}\x1b[0m`);
        } else if (this.options.verbose) {
            console.log(`🚀 [CFF] Initializing functions from: ${this.runnerPath}`);
        }

        const stagedRegistry = this._createEmptyRegistry();

        // Manifest mode: the project decides which files run, at which stage, with which runtime
        if (this.options.files) {
            this.stores.clear();
            for (const file of this.options.files) {
                this._loadFile(file.path, stagedRegistry, { stage: file.stage, id: file.id, runtime: file.runtime, kvsFile: file.kvsFile });
            }
            this.modules = stagedRegistry;
            return;
        }

        if (!this.runnerPath || !fs.existsSync(this.runnerPath)) {
            if (this.runnerPath) {
                console.error(`\n\x1b[31m🛑 [CFFRunner] Hook file or directory not found: ${this.runnerPath}\x1b[0m`);
                this.emit('build_error', { 
                    type: 'CloudFront Function', 
                    path: this.runnerPath,
                    error: `File or directory not found: ${this.runnerPath}`
                });
            }
            this.modules = stagedRegistry; // Ensure empty state
            return;
        }

        const stat = fs.statSync(this.runnerPath);
        const files = stat.isDirectory()
            ? fs.readdirSync(this.runnerPath).filter(f => f.endsWith('.js')).sort()
            : [this.runnerPath];

        for (const file of files) {
            const fullPath = stat.isDirectory() ? path.join(this.runnerPath, file) : file;
            this._loadFile(fullPath, stagedRegistry);
        }

        const totalFound = Object.values(stagedRegistry).flat().length;
        if (totalFound > 0) {
            this.modules = stagedRegistry;
        }
    }

    protected _loadFile(filePath: string, registry: Registry, override?: FileOverride): void {
        const filename = path.basename(filePath);
        try {
            let fileCode = fs.readFileSync(filePath, 'utf8');
            const type = override?.stage ?? HookUtility.detectStage(fileCode, filename);
            
            fileCode = CodeProcessor.bake(fileCode, this.bakeVars);

            const runtime = (override?.runtime ?? 'cloudfront-js-1.0') as CFFRuntime;
            const isRuntime2 = runtime === 'cloudfront-js-2.0';
            const { valid, violations } = this.validator.validate(filename, fileCode, runtime);
            const codeLines = fileCode.split('\n');

            for (const v of violations) {
                if (v.level === 'error') {
                    console.error(`\n🛑 [\x1b[31mBuild Error\x1b[0m] CFF ES 5.1 Violation in ${filename}`);
                    console.error(`   ${v.message} ${v.lineNum ? `(Line ${v.lineNum})` : ''}`);
                } else {
                    console.warn(`\n⚠️  [CFF] Policy Warning in ${filename} (Line ${v.lineNum || '?'})`);
                    console.warn(`   ${v.message}`);
                }
            }

            if (!valid) {
                const firstErr = violations.find(v => v.level === 'error');
                this.compileError = violations.filter(v => v.level === 'error').map(v => v.message).join('\n');
                
                const snippet = SnippetExtractor.extract(filePath, firstErr?.lineNum || null);
                
                this.emit('build_error', { 
                    type: 'CloudFront Function', 
                    file: path.basename(filePath),
                    path: filePath,
                    error: this.compileError,
                    line: firstErr?.lineNum || null,
                    snippet: snippet
                });
                return;
            }

            // Runtime 2.0: `import cf from 'cloudfront'` becomes a sandbox binding; functions run in strict mode
            // ("Functions operate in strict mode by default"). Prefixed on line 1 so line numbers don't move.
            const runnableCode = isRuntime2 ? `'use strict';${instrumentLoops(rewriteImports(fileCode))}` : fileCode;

            // VM Syntax Check
            try {
                new vm.Script(runnableCode, { filename: filePath });
            } catch (err: any) {
                const { line } = SnippetExtractor.parseError(err, filePath);
                const snippet = SnippetExtractor.extract(filePath, line);

                this.emit('build_error', { 
                    type: 'CloudFront Function', 
                    file: path.basename(filePath),
                    path: filePath,
                    error: err.message,
                    line: line,
                    snippet: snippet
                });
                return;
            }

            // AWS Parity ("Quotas on CloudFront Functions"): 10 KB maximum function size, not adjustable.
            // Deterministic, so --strict treats it as a build error (AWS won't accept the function).
            const codeSize = Buffer.byteLength(fileCode);
            if (codeSize > CFF_LIMITS.MAX_CODE_SIZE_BYTES) {
                const sizeError = `Function size ${codeSize} bytes exceeds the ${CFF_LIMITS.MAX_CODE_SIZE_BYTES}-byte (10 KB) CloudFront Functions limit`;
                if (this.options.strict) {
                    console.error(`\n🛑 [\x1b[31mBuild Error\x1b[0m] ${filename}: ${sizeError}`);
                    this.emit('build_error', {
                        type: 'CloudFront Function',
                        file: path.basename(filePath),
                        path: filePath,
                        error: sizeError,
                        line: null,
                        snippet: null
                    });
                    return;
                }
                console.warn(`⚠️  [CFF] ${filename}: ${sizeError}`);
            }
            // Reported with the build, so editors can show them next to the code
            const warnings = violations.filter(v => v.level !== 'error').map(v => ({ message: v.message, line: v.lineNum ?? null }));
            if (codeSize > CFF_LIMITS.MAX_CODE_SIZE_BYTES) {
                warnings.push({ message: `Function size ${codeSize} bytes exceeds the ${CFF_LIMITS.MAX_CODE_SIZE_BYTES}-byte (10 KB) CloudFront Functions limit`, line: null });
            }

            if (this.options.outputPath) {
                const outFilePath = path.join(this.options.outputPath, filename);
                fs.mkdirSync(path.dirname(outFilePath), { recursive: true });
                fs.writeFileSync(outFilePath, fileCode);
            }

            const mod = { 
                id: override?.id ?? `${type}-cff-${registry[type].length}`, 
                handler: fileCode, 
                filePath: filePath,
                runtime,
                store: override?.kvsFile ? this._store(override.kvsFile) : undefined,
                script: isRuntime2
                    ? new vm.Script(`${runnableCode}\n${RUNTIME2_TAIL}`, { filename: path.basename(filePath) })
                    : new vm.Script(`${fileCode}\nhandler(event);`, { filename: path.basename(filePath) })
            };
            
            // Professional Fidelity: Pre-heat the JIT compiler to ensure "Hot" execution for the first request
            this._warmup(mod);
            
            registry[type].push(mod);
            console.log(`\x1b[32m✅ [CFF] Build Success: ${path.basename(filePath)}\x1b[0m`);
            this.emit('build_success', { type: 'cff', file: filePath, size: codeSize, warnings });

        } catch (err: any) {
            console.error(`🛑 [CFF] Load Error: ${err.message}`);
        }
    }

    /** The compiled function with this id, whichever stage registry holds it. */
    public getModule(id: string): any | undefined {
        for (const mods of Object.values(this.modules)) {
            const found = mods.find(m => m.id === id);
            if (found) return found;
        }
        return undefined;
    }

    public hasModule(id: string): boolean {
        return this.getModule(id) !== undefined;
    }

    /** 2.x API: runs every loaded function of `type` in order, minus `disabledIds`. */
    public async runChain(type: HookType, event: any, disabledIds: string[] = [], onHookComplete?: (mod: any, result: any) => void): Promise<{ result: any; logs: string[] }> {
        const mods = this.modules[type].filter(mod => {
            if (!disabledIds.includes((mod as any).id)) return true;
            if (this.options.debug) {
                console.log(`\x1b[90m[${event.context.requestId}] \x1b[36m[CFF]\x1b[0m Bypassing ${path.basename(mod.filePath)} (Manual Override)`);
            }
            return false;
        });
        return this._runModules(type, mods, event, onHookComplete);
    }

    /** Runs the given functions (by id, in order) for one viewer event. */
    public async runStage(type: HookType, ids: string[], event: any, onHookComplete?: (mod: any, result: any) => void): Promise<{ result: any; logs: string[] }> {
        const mods = ids.map(id => this.getModule(id)).filter(Boolean);
        return this._runModules(type, mods, event, onHookComplete);
    }

    private async _runModules(type: HookType, mods: any[], event: any, onHookComplete?: (mod: any, result: any) => void): Promise<{ result: any; logs: string[] }> {
        let currentEvent = event;
        const allLogs: string[] = [];

        for (const mod of mods) {

            if (this.options.verbose) {
                allLogs.push(`\x1b[90m[${event.context.requestId}] \x1b[90m├─\x1b[0m \x1b[36m○ [CFF: ${type}] ${path.basename(mod.filePath)}\x1b[0m`);
            }
            // Snapshot what the function is given, to validate its header mutations afterwards
            const givenHeaders = HeaderManager.normalizeHeaders(type === 'viewer-request' ? currentEvent.request?.headers : currentEvent.response?.headers);
            const givenQuerystring = type === 'viewer-response' ? JSON.stringify(currentEvent.request?.querystring ?? {}) : '';

            const { result, logs } = this._executeSync(mod, currentEvent, path.basename(mod.filePath), type);
            allLogs.push(...logs);

            // AWS Parity: "A function can read a query string, but cannot create or update one, for
            // origin response and viewer response events." The change is ignored.
            if (type === 'viewer-response') {
                const returnedRequest = result?.request ?? currentEvent.request;
                if (JSON.stringify(returnedRequest?.querystring ?? {}) !== givenQuerystring) {
                    const original = JSON.parse(givenQuerystring);
                    if (currentEvent.request) currentEvent.request.querystring = original;
                    if (result?.request) result.request.querystring = original;
                    EdgeError.reportValidation('function', `${path.basename(mod.filePath)}: viewer-response functions can't change the query string`, this.options.strict);
                }
            }

            if (result) {
                // AWS Parity: header restrictions apply to all edge functions. A viewer-request function
                // that generates a response isn't mutating the request, so it isn't checked here.
                const returned = type === 'viewer-request'
                    ? ((result.method || result.uri) ? result : (result.request && !result.response ? result.request : null))
                    : (result.statusCode ? result : result.response || null);
                if (returned?.headers) {
                    this.headerManager.reconcile(HeaderManager.normalizeHeaders(returned.headers), givenHeaders, type, this.options.strict, 'function');
                }

                if (result.method || result.uri) currentEvent.request = result;
                else if (result.statusCode) currentEvent.response = result;
                else if (result.request || result.response) currentEvent = result;

                if (type === 'viewer-request' && currentEvent.response) break;
            }
            if (onHookComplete) onHookComplete(mod, result);
        }
        return { result: currentEvent, logs: allLogs };
    }

    public toCFFEvent(req: any, resData: any = null, hookType: HookType): any {
        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const event: any = {
            version: '1.0',
            context: { eventType: hookType, requestId: req.requestID || 'local' },
            viewer: { ip: req.socket?.remoteAddress || '127.0.0.1' },
            request: { method: req.method, uri: url.pathname, headers: {}, querystring: {}, cookies: {} }
        };

        // AWS event structure: each field has the FIRST `value`; `multiValue` (all values) appears
        // only when the name is repeated ("Duplicate query strings, headers, and cookies").
        const addField = (target: Record<string, any>, name: string, field: any) => {
            const existing = target[name];
            if (!existing) { target[name] = field; return; }
            if (!existing.multiValue) existing.multiValue = [{ ...existing }];
            existing.multiValue.push(field);
        };

        url.searchParams.forEach((value, key) => addField(event.request.querystring, key, { value }));

        if (resData) {
            event.response = { statusCode: resData.status || 200, statusDescription: resData.statusDescription || 'OK', headers: {}, cookies: {} };
            for (const [key, value] of Object.entries(resData.headers || {})) {
                const lowerKey = key.toLowerCase();
                if (HeaderManager.isDisallowed(lowerKey)) continue; // AWS Parity: never exposed to functions
                const values = (Array.isArray(value) ? value : [value]).map((v: any) => String(v?.value ?? v));
                // "If the response contains any Set-Cookie headers, those headers are not part of the headers object"
                if (lowerKey === 'set-cookie') {
                    for (const line of values) {
                        const [pair, ...attributes] = line.split(';');
                        const eq = pair.indexOf('=');
                        if (eq <= 0) continue;
                        const cookie: any = { value: pair.slice(eq + 1).trim() };
                        if (attributes.length) cookie.attributes = attributes.map(a => a.trim()).join('; ');
                        addField(event.response.cookies, pair.slice(0, eq).trim(), cookie);
                    }
                    continue;
                }
                event.response.headers[lowerKey] = { value: values[0] };
            }
        }

        for (const [key, val] of Object.entries(req.headers || {})) {
            const lowerKey = key.toLowerCase();
            if (HeaderManager.isDisallowed(lowerKey)) continue; // AWS Parity: never exposed to functions
            const value = String(Array.isArray(val) ? (val[0]?.value || val[0]) : val);

            // "If the request contains any Cookie headers, those headers are not part of the headers object"
            if (lowerKey === 'cookie') {
                value.split(';').forEach(cookieStr => {
                    const eq = cookieStr.indexOf('=');
                    if (eq > 0) addField(event.request.cookies, cookieStr.slice(0, eq).trim(), { value: cookieStr.slice(eq + 1).trim() });
                });
                continue;
            }
            event.request.headers[lowerKey] = { value };
        }
        return event;
    }

    public fromCFFEvent(cffResponse: any): any {
        if (!cffResponse) return null;
        let target = cffResponse.response ? cffResponse.response : (cffResponse.request ? cffResponse.request : cffResponse);
        
        const headers = { ...target.headers };
        const isResponse = !!(target.statusCode || target.status);

        // Cookies live in `cookies`, not `headers`: rebuild Set-Cookie (responses) or Cookie (requests).
        // A cookie with `multiValue` contributes every one of its values.
        if (target.cookies) {
            const expand = (name: string, c: any): any[] => (Array.isArray(c?.multiValue) && c.multiValue.length ? c.multiValue : [c]).map((v: any) => ({ name, ...v }));
            const all = Object.entries(target.cookies).flatMap(([name, c]) => expand(name, c));
            if (isResponse) {
                const setCookies = all.map(c => `${c.name}=${c.value}${c.attributes ? `; ${c.attributes}` : ''}`);
                if (setCookies.length > 0) headers['set-cookie'] = setCookies.map(v => ({ key: 'Set-Cookie', value: v }));
            } else if (all.length > 0) {
                headers['cookie'] = [{ key: 'Cookie', value: all.map(c => `${c.name}=${c.value}`).join('; ') }];
            }
        }

        if (isResponse) {
            const response: any = {
                status: target.statusCode || target.status,
                statusDescription: target.statusDescription || 'OK',
                headers,
                _isResponse: true
            };
            // "specify the body content in the data field, and the body encoding in the encoding field",
            // or, as a shortcut, a plain string in `body` (treated as text). No body: the original is kept.
            if (target.body !== undefined) {
                response.body = typeof target.body === 'string'
                    ? { data: target.body, encoding: 'text' }
                    : { data: target.body.data ?? '', encoding: target.body.encoding === 'base64' ? 'base64' : 'text' };
            }
            return response;
        }
        if (target.method || target.uri || target.querystring) {
            let querystring = '';
            if (target.querystring) {
                const params = new URLSearchParams();
                for (const [key, val] of Object.entries(target.querystring)) {
                    const cffVal = val as any;
                    if (cffVal.multiValue) {
                        cffVal.multiValue.forEach((mv: any) => params.append(key, mv.value));
                    } else if (cffVal.value !== undefined) {
                        params.append(key, cffVal.value);
                    }
                }
                querystring = params.toString();
            }
            return { url: target.uri, querystring, headers, _isResponse: false };
        }
        return null;
    }

    private _warmup(mod: { handler: string; filePath: string }) {
        // High Fidelity Warmup: Providing a robust dummy event to prevent hooks from crashing
        // when they attempt to access headers, cookies, or response status during load time.
        const dummyEvent = { 
            version: '1.0', 
            context: { requestId: 'warmup' }, 
            viewer: { ip: '127.0.0.1' }, 
            request: { 
                method: 'GET', 
                uri: '/', 
                headers: {}, 
                querystring: {}, 
                cookies: {} 
            },
            response: {
                statusCode: 200,
                statusDescription: 'OK',
                headers: {},
                cookies: {}
            }
        };
        // Prime V8 with several runs to reach optimized cruising speed before actual traffic hits
        for (let i = 0; i < 5; i++) {
            try {
                this._executeSync(mod, dummyEvent, path.basename(mod.filePath));
            } catch (e) {
                // Warmup errors are ignored, but a failing function gains nothing from more runs
                // (and a runaway one would cost a full guard period each time)
                break;
            }
        }
    }

    private _executeSync(mod: { handler: string; filePath: string }, event: any, filename: string, stage: string = 'viewer-request'): { result: any; cpuTimeMs: number; logs: string[] } {
        const logBuffer: Array<{ level: string; args: any[]; ts: number }> = [];
        // High Fidelity: Use Date.now() (numeric) to avoid expensive ISO string formatting inside the timed block
        const record = (level: string) => (...args: any[]) => logBuffer.push({ level, args, ts: Date.now() });
        const isRuntime2 = (mod as any).runtime === 'cloudfront-js-2.0';

        const sandbox: any = isRuntime2
            ? { event, ...runtime2Globals({ log: record('log') }), __done__: { state: 'pending' } }
            : {
                event: event,
                console: { log: record('log'), error: record('error'), warn: record('warn'), info: record('info') },
                Math, JSON, Object, String, Array, Number, Date,
                Buffer: undefined, process: undefined, require: undefined
            };
        sandbox.__startTime__ = Date.now();

        // Runtime 2.0: promise jobs run inside the guarded evaluation (see cff2/runtime2.ts)
        const context = isRuntime2 ? vm.createContext(sandbox, { microtaskMode: 'afterEvaluate' }) : vm.createContext(sandbox);
        if (isRuntime2) {
            sandbox.__cloudfront__ = cloudfrontModule(context, (mod as any).store);
            sandbox[LOOP_GUARD] = createLoopGuard(CFF_LIMITS.RUNAWAY_GUARD_MS, `${path.basename(mod.filePath)} did not complete within the ${CFF_LIMITS.RUNAWAY_GUARD_MS}ms emulator guard`);
        }
        FROZEN_DATE_PRELUDE.runInContext(context);

        const script = (mod as any).script;
        const start = process.hrtime.bigint();
        try {
            // The VM timeout throws on runaway code; its setup cost is subtracted via CFF_OVERHEAD_MS.
            let result = script.runInContext(context, isRuntime2 ? CFF2_VM_OPTIONS : CFF_VM_OPTIONS);
            if (isRuntime2) {
                const done = sandbox.__done__;
                if (done.state === 'error') throw done.error;
                if (done.state !== 'ok') throw new Error('The handler returned a promise that never settled (CloudFront Functions can only await KeyValueStore reads)');
                result = done.value;
            }
            const end = process.hrtime.bigint();
            let cpuTimeMs = Number(end - start) / 1e6;

            // Fidelity Adjustment: Subtract simulator overhead (VM runInContext base cost)
            cpuTimeMs = Math.max(0.01, cpuTimeMs - CFFRunner.CFF_OVERHEAD_MS);

            if (cpuTimeMs > CFF_LIMITS.MAX_CPU_TIME_MS) {
                console.warn(`⚠️  [CFF] ${path.basename(mod.filePath)} exceeded 1ms CPU limit (${cpuTimeMs.toFixed(2)}ms).`);
            }

            const formattedLogs: string[] = [];
            // Clinical Alignment: No direct console.log here. Instead, return logs to orchestrator 
            // for atomic flushing alongside the request header.
            if (logBuffer.length > 0 && event.context.requestId !== 'warmup') {
                for (const log of truncateLogs(logBuffer)) {
                    formattedLogs.push(this._log(log.level, log.message, event.context.requestId, filename, stage, log.ts));
                }
            }

            return { result, cpuTimeMs, logs: formattedLogs };
        } catch (err: any) {
            console.error(`🛑 [CFF] Execution Error in ${path.basename(mod.filePath)}: ${err.message}`);
            
            const formattedLogs: string[] = [];
            // Still flush any logs that occurred before the crash
            if (logBuffer.length > 0 && event.context.requestId !== 'warmup') {
                for (const log of truncateLogs(logBuffer)) {
                    formattedLogs.push(this._log(log.level, log.message, event.context.requestId, filename, stage, log.ts));
                }
            }

            // Runaway code is stopped in every mode; other errors fail only under --strict
            if (err?.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT' || err?.__runaway__) {
                throw EdgeError.execution('function', `${path.basename(mod.filePath)} did not complete within the ${CFF_LIMITS.RUNAWAY_GUARD_MS}ms emulator guard`);
            }
            if (this.options.strict) throw EdgeError.execution('function', `Unhandled error in ${path.basename(mod.filePath)}: ${err.message}`);
            return { result: null, cpuTimeMs: 0, logs: formattedLogs };
        }
    }

    /** One KeyValueStore per file, loaded on first use (and again after a reload). */
    private _store(file: string): KeyValueStore {
        let store = this.stores.get(file);
        if (!store) {
            store = new KeyValueStore(file);
            for (const problem of store.load(!!this.options.strict)) {
                const line = `[CFF] KeyValueStore ${path.basename(file)}: ${problem.message}`;
                if (problem.severity === 'error') console.error(`🛑 ${line}`); else console.warn(`⚠️  ${line}`);
            }
            this.stores.set(file, store);
        }
        return store;
    }

    private _log(level: string, message: string, requestId: string, filename: string, stage: string, overrideTimestamp?: number): string {
        const timestamp = overrideTimestamp ? new Date(overrideTimestamp).toISOString() : new Date().toISOString();
        const type = `[CFF: ${stage}] ${filename}`;
        
        // No direct console.log here! We return the formatted line to the caller for atomic alignment.
        // Clinical Spine: Using vertical connector and indented level marker.
        const levelColors: any = { 'info': '\x1b[34m', 'warn': '\x1b[33m', 'error': '\x1b[31m', 'debug': '\x1b[90m', 'log': '\x1b[37m' };
        const color = levelColors[level] || '\x1b[37m';
        
        const prefix = `\x1b[90m[${requestId}] \x1b[90m│\x1b[0m    ${color}[${level}]\x1b[0m`;
        const logLine = `${prefix} ${message}`;

        // Professional Fidelity: Use the Async WriteStream for persistence
        if (this.logStream) {
            try {
                const fileLogLine = `${timestamp}  [${requestId}]  [${level.toUpperCase()}]  [${type}]  ${message}\n`;
                this.logStream.write(fileLogLine);
            } catch (err: any) {
                // Silently fail
            }
        }

        return logLine;
    }
}
