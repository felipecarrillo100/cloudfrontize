import fs from 'fs';
import path from 'path';
import { AsyncLocalStorage } from 'async_hooks';
import vm from 'vm';
import { HotRunner } from './HotRunner';
import { FileOverride, HookModule, HookType, Registry } from './types';
import { AWS_LIMITS, AWS_HEADERS, AWS_RUNTIME } from '../constants';
import { HeaderManager } from './HeaderManager';
import { CodeProcessor } from './CodeProcessor';
import { SnippetExtractor } from './SnippetExtractor';
import { HookUtility } from './HookUtility';
import { EdgeError } from './EdgeError';
import { createLambdaProcess, createLambdaRequire, sandboxTmpDir, wrapFetch } from './lambda/sandbox';


/**
 * A high-fidelity runtime for AWS Lambda@Edge functions.
 * 
 * @namespace Backend
 * The EdgeRunner executes user-provided Node.js code within an isolated `vm` sandbox. 
 * It emulates the Lambda@Edge event structure, multi-value header logic, 
 * and strict AWS quotas (timeout, execution limits).
 * 
 * It supports hot-reloading and environment variable baking via the `CodeProcessor`.
 * 
 * @see {@link https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-limits.html#limits-lambda-at-edge | AWS Lambda@Edge Quotas}
 */
export class EdgeRunner extends HotRunner {
    private logContext = new AsyncLocalStorage<{ requestId: string; hookType: string; filename: string; logs: string[] }>();
    public compileError: string | null = null;
    private static EDGE_OVERHEAD_MS: number = -1;
    /** Variables from the env file (they win over the defaults, including AWS_EXECUTION_ENV). */
    private _envFileVars: Record<string, string> = {};

    private headerManager = new HeaderManager();

    /**
     * Initializes the EdgeRunner with a path to a single JS file or directory of hooks.
     * @param runnerPath - Absolute path to the edge function(s).
     * @param options - Execution options (strict mode, env paths, etc).
     */
    constructor(runnerPath: string | null, public options: any = {}) {
        super(runnerPath, options);
        EdgeRunner._calculateOverhead();
    }

    private static _calculateOverhead() {
        if (this.EDGE_OVERHEAD_MS !== -1) return;
        let total = 0;
        const runs = 10;
        const noop = (evt: any, ctx: any, cb: any) => cb(null, evt.Records[0].cf.request);
        
        for (let i = 0; i < runs; i++) {
            const start = process.hrtime.bigint();
            noop({ Records: [{ cf: { request: {} } }] }, {}, (err: any, res: any) => {
                const end = process.hrtime.bigint();
                total += Number(end - start) / 1e6;
            });
        }
        this.EDGE_OVERHEAD_MS = total / runs;
    }

    public load(changedFile?: string): void {
        const newModules = this._createEmptyRegistry();

        // Manifest mode: the project decides which files run and at which stage
        if (this.options.files) {
            this._envFileVars = this._loadEnv(this.options.envPath);
            this.envVars = { ...AWS_RUNTIME.DEFAULT_ENV, ...this._envFileVars };
            this.bakeVars = this._loadBake(this.options.bakePath);
            this.compileError = null;
            for (const file of this.options.files) {
                this._loadFile(file.path, newModules, { stage: file.stage, id: file.id });
            }
            this.modules = newModules;
            return;
        }
        
        if (!this.runnerPath || !fs.existsSync(this.runnerPath)) {
            if (this.runnerPath) {
                console.error(`\n\x1b[31m🛑 [EdgeRunner] Hook file or directory not found: ${this.runnerPath}\x1b[0m`);
                this.emit('build_error', { 
                    type: 'Lambda@Edge', 
                    path: this.runnerPath,
                    error: `File or directory not found: ${this.runnerPath}`
                });
            }
            this.modules = newModules; // Ensure empty state
            return;
        }

        // Fidelity Fix: Ensure DEFAULT_ENV is always present and merged correctly
        this._envFileVars = this._loadEnv(this.options.envPath);
        this.envVars = { ...AWS_RUNTIME.DEFAULT_ENV, ...this._envFileVars };
        this.bakeVars = this._loadBake(this.options.bakePath);
        this.compileError = null;

        const stat = fs.statSync(this.runnerPath);

        if (stat.isDirectory()) {
            // Lexicographical order for fidelity consistency
            const files = fs.readdirSync(this.runnerPath).filter(f => f.endsWith('.js')).sort();
            for (const file of files) {
                this._loadFile(path.resolve(this.runnerPath, file), newModules);
            }
        } else if (this.runnerPath.endsWith('.js')) {
            this._loadFile(this.runnerPath, newModules);
        }

        this.modules = newModules;
    }

    protected _loadFile(filePath: string, registry: Registry, override?: FileOverride): void {
        try {
            let content = fs.readFileSync(filePath, 'utf8');
            const stage = override?.stage ?? HookUtility.detectStage(content, filePath);

            // Production Baking (Strata-Fidelity)
            content = CodeProcessor.bake(content, this.bakeVars);

            // [BAKER] Persistent Output for Baked Modules
            if (this.options.outputPath) {
                const outFilePath = path.resolve(this.options.outputPath, path.basename(filePath));
                try {
                    fs.mkdirSync(path.dirname(outFilePath), { recursive: true });
                    fs.writeFileSync(outFilePath, content);
                } catch (err: any) {
                    console.error(`\x1b[31m🛑 [EdgeRunner] Failed to write baked file: ${err.message}\x1b[0m`);
                }
            }

            // Professional: Sandbox preparation and hook detection
            const projectDir = this.options.projectDir
                ?? (this.runnerPath && fs.existsSync(this.runnerPath) && fs.statSync(this.runnerPath).isDirectory() ? this.runnerPath : path.dirname(filePath));
            const sandboxContext = {
                hookFile: filePath,
                projectDir,
                tmpDir: sandboxTmpDir(projectDir),
                warn: (message: string) => this._fidelityWarning(message)
            };
            const exportsObj = {};
            const sandbox: any = {
                exports: exportsObj,
                module: { exports: exportsObj },
                global: null, // assigned below

                console: {
                    log: (...args: any[]) => this._log('log', args),
                    error: (...args: any[]) => this._log('error', args),
                    warn: (...args: any[]) => this._log('warn', args),
                    info: (...args: any[]) => this._log('info', args),
                },
                // AWS Parity: any module, in every event; fs and networking behave like Lambda's (lambda/sandbox.ts)
                require: createLambdaRequire(sandboxContext),
                // AWS Parity: "Lambda environment variables" aren't supported, except reserved ones.
                // The host's environment is never visible.
                process: createLambdaProcess(Object.fromEntries(
                    Object.entries({ ...this.envVars, AWS_EXECUTION_ENV: `AWS_Lambda_${override?.runtime ?? AWS_RUNTIME.DEFAULT_NODE_RUNTIME}`, ...this._envFileVars })
                        .map(([k, v]) => [k, (v === null || v === undefined) ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v))])
                ), sandboxContext),
                setTimeout, clearTimeout, setInterval, clearInterval, setImmediate, clearImmediate, queueMicrotask, structuredClone,
                Buffer, Promise, URL, URLSearchParams, TextEncoder, TextDecoder, AbortController, AbortSignal,
                fetch: wrapFetch(sandboxContext), Headers, Request, Response, FormData, Blob, performance
            };
            sandbox.global = sandbox;


            const script = new vm.Script(content, { filename: filePath });
            script.runInNewContext(sandbox);

            const mod = sandbox.exports;
            const finalType = stage;

            if (mod.handler && finalType && registry[finalType]) {
                // Fidelity Check: AWS only allows one hook per type. (Manifest mode: the manifest enforces one
                // function per event per behavior, and the same stage may hold functions of different behaviors.)
                if (!override && registry[finalType].length > 0) {
                    console.warn(`\x1b[33m⚠️  [CloudFrontize] Warning: Multiple files for "${finalType}" detected. Only "${path.basename(registry[finalType][0].filePath)}" will be used.\x1b[0m`);
                    return;
                }
                registry[finalType].push({ 
                    id: override?.id ?? `${finalType}-le-${registry[finalType].length}`, 
                    handler: mod.handler, 
                    filePath: filePath 
                });
                console.log(`\x1b[32m✅ [L@E] Build Success: ${path.basename(filePath)}\x1b[0m`);
                this.emit('build_success', { type: 'edge', file: filePath });
            }
        } catch (err: any) {
            this.compileError = err.message;
            console.error(`\x1b[31m🛑 [EdgeRunner] Load Error (${path.basename(filePath)}): ${err.message}\x1b[0m`);
            
            const { line, col } = SnippetExtractor.parseError(err, filePath);
            const snippet = SnippetExtractor.extract(filePath, line);

            this.emit('build_error', { 
                type: 'Lambda@Edge', 
                file: path.basename(filePath),
                path: filePath,
                error: err.message,
                line: line,
                column: col,
                snippet: snippet
            });
        }
    }

    private warned = new Set<string>();

    /** Each distinct fidelity warning is printed once per runner. */
    private _fidelityWarning(message: string): void {
        if (this.warned.has(message)) return;
        this.warned.add(message);
        console.warn(`\x1b[33m⚠️  [Fidelity Warning] ${message}\x1b[0m`);
    }

    private _log(level: string, args: any[], overrideTimestamp?: number): string {
        const ctx = this.logContext.getStore();
        const timestamp = overrideTimestamp ? new Date(overrideTimestamp).toISOString() : new Date().toISOString();
        
        const requestId = ctx?.requestId || 'UNKNOWN';
        const hookType = ctx?.hookType || 'Lambda@Edge';
        const filename = ctx?.filename || 'system';
        const type = `[L@E: ${hookType}] ${filename}`;

        const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
        
        // Clinical Spine: Using vertical connector and indented level marker.
        const levelColors: any = { 'info': '\x1b[34m', 'warn': '\x1b[33m', 'error': '\x1b[31m', 'debug': '\x1b[90m', 'log': '\x1b[37m' };
        const color = levelColors[level] || '\x1b[37m';

        // Professional Fidelity: Gutter-aligned spine and type
        const prefix = requestId !== 'UNKNOWN'
            ? `\x1b[90m[${requestId}] \x1b[90m│\x1b[0m    ${color}[${level}]\x1b[0m` 
            : `\x1b[90m[${timestamp}]\x1b[0m`;
        
        const logLine = `${prefix} ${message}`;

        // Clinical Visibility: If debug mode is enabled, mirror to console immediately.
        if (this.options.debug) {
            console[level === 'log' ? 'log' : (level === 'error' ? 'error' : (level === 'warn' ? 'warn' : 'info'))](logLine);
        }

        // Clinical Alignment: If we are in a request context, push to the shared buffer for atomic flushing
        if (ctx?.logs) {
            ctx.logs.push(logLine);
        }

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

    /** The compiled function with this id, whichever stage registry holds it. */
    public getModule(id: string): HookModule | undefined {
        for (const mods of Object.values(this.modules)) {
            const found = mods.find(m => m.id === id);
            if (found) return found;
        }
        return undefined;
    }

    public hasModule(id: string): boolean {
        return this.getModule(id) !== undefined;
    }

    /** 2.x API: runs every loaded viewer-request then origin-request hook, minus `disabledIds`. */
    public async runRequestHook(req: any, bodyBuffer?: Buffer, requestID = 'UNKNOWN', disabledIds: string[] = [], bodyTruncated = false): Promise<{ result: any; logs: string[]; exposedHeaders: any }> {
        const plan = (['viewer-request', 'origin-request'] as HookType[]).map(type => ({
            type,
            mods: this.modules[type].filter(m => !disabledIds.includes(m.id))
        }));
        return this._runRequestModules(req, bodyBuffer, requestID, bodyTruncated, plan);
    }

    /** Runs the given functions (by id, in order) for one request event. */
    public async runRequestStage(stage: HookType, ids: string[], req: any, bodyBuffer?: Buffer, requestID = 'UNKNOWN', bodyTruncated = false): Promise<{ result: any; logs: string[]; exposedHeaders: any }> {
        const mods = ids.map(id => this.getModule(id)).filter((m): m is HookModule => !!m);
        return this._runRequestModules(req, bodyBuffer, requestID, bodyTruncated, [{ type: stage, mods }]);
    }

    private async _runRequestModules(req: any, bodyBuffer: Buffer | undefined, requestID: string, bodyTruncated: boolean, plan: { type: HookType; mods: HookModule[] }[]): Promise<{ result: any; logs: string[]; exposedHeaders: any }> {
        const request = this._buildRequestRecord(req, bodyBuffer, bodyTruncated);
        // Capture the Exposure Boundary: the exact headers handed to the Lambda at invocation time.
        // This is used by the caller (Orchestrator) to determine which deletions were intentional.
        const exposedHeaders = this._deepClone(request.headers);
        let totalDurationMs = 0;
        const allLogs: string[] = [];
        let finalResult: any = null;

        for (const { type, mods } of plan) {
            for (const mod of mods) {
                const originalHeaders = this._deepClone(request.headers);

                if (this.options.verbose) {
                    allLogs.push(`\x1b[90m[${requestID}] \x1b[90m├─\x1b[0m \x1b[35m○ [L@E: ${type}] ${path.basename(mod.filePath)}\x1b[0m`);
                }

                const { result, durationMs, timedOut } = await this.logContext.run({ 
                    requestId: requestID, 
                    hookType: type, 
                    filename: path.basename(mod.filePath),
                    logs: allLogs 
                }, () => this._invoke(mod.handler, request, type));
                totalDurationMs += durationMs;

                if (timedOut) return { result: this._timeoutResponse(mod.filePath, type), logs: allLogs, exposedHeaders };
                if (!result) continue;

                if (result.status || result.statusCode) {
                   const headers = this.headerManager.normalizeHeaders(result.headers);
                   const record: any = { headers };
                   record.status = String(result.status || result.statusCode);
                   record.body = result.body;
                   if (result.bodyEncoding) record.bodyEncoding = result.bodyEncoding;

                   this._checkGeneratedResponseSize(type, headers, record.body);

                    record._isResponse = true;
                    record.totalDurationMs = String(totalDurationMs);
                    record.id = mod.id;
                    record.type = type;
                    record.uri = request.uri;
                    
                    finalResult = record;
                    break;
                 }

                if (result.uri !== undefined) request.uri = result.uri;
                if (result.querystring !== undefined) request.querystring = result.querystring;
                // A hook may return a new request object instead of mutating the event in place
                if (result !== request && result.body !== undefined) request.body = result.body;

                if (result.headers) {
                    const mutatedHeaders = this.headerManager.normalizeHeaders(result.headers);
                    this.headerManager.reconcile(mutatedHeaders, originalHeaders, type, this.options.strict);
                    request.headers = mutatedHeaders;
                }
            }
            if (finalResult) break;
        }

        if (!finalResult) {
            finalResult = { 
                headers: request.headers,
                uri: request.uri,
                querystring: request.querystring,
                body: request.body,
                totalDurationMs: String(totalDurationMs),
                type: plan.length === 1 ? plan[0].type : 'viewer-request'
            };
        }

        return { result: finalResult, logs: allLogs, exposedHeaders };
    }

    /** 2.x API: runs the loaded hooks of `stage` (or both response stages), minus `disabledIds`. */
    public async runResponseHook(req: any, resData: any, requestID = 'UNKNOWN', stage?: HookType, disabledIds: string[] = []): Promise<{ result: any; logs: string[] }> {
        // If no specific stage is targetted, run both as per legacy behavior
        const stages = stage ? [stage] : (['origin-response', 'viewer-response'] as HookType[]);
        const plan = stages.map(type => ({ type, mods: this.modules[type].filter(m => !disabledIds.includes(m.id)) }));
        return this._runResponseModules(req, resData, requestID, plan);
    }

    /** Runs the given functions (by id, in order) for one response event. */
    public async runResponseStage(stage: HookType, ids: string[], req: any, resData: any, requestID = 'UNKNOWN'): Promise<{ result: any; logs: string[] }> {
        const mods = ids.map(id => this.getModule(id)).filter((m): m is HookModule => !!m);
        return this._runResponseModules(req, resData, requestID, [{ type: stage, mods }]);
    }

    private async _runResponseModules(req: any, resData: any, requestID: string, plan: { type: HookType; mods: HookModule[] }[]): Promise<{ result: any; logs: string[] }> {
        const request = this._buildRequestRecord(req);
        let totalDurationMs = 0;
        // AWS Parity: disallowed headers are never exposed to edge functions
        let reconciledHeaders = HeaderManager.withoutDisallowed(this.headerManager.normalizeHeaders(resData.headers || {}));
        const allLogs: string[] = [];

        for (const { type, mods } of plan) {
            for (const mod of mods) {
                const originalHeaders = this._deepClone(reconciledHeaders);
                const originalQuerystring = request.querystring;

                if (this.options.verbose) {
                    allLogs.push(`\x1b[90m[${requestID}]\x1b[0m \x1b[90m├─\x1b[0m ○ \x1b[35m[L@E: ${type}]\x1b[0m ${path.basename(mod.filePath)}`);
                }

                const { result, durationMs, timedOut } = await this.logContext.run({ 
                    requestId: requestID, 
                    hookType: type, 
                    filename: path.basename(mod.filePath),
                    logs: allLogs 
                }, () => this._invoke(mod.handler, {
                    request,
                    response: {
                        status: String(resData.status),
                        statusDescription: resData.statusDescription,
                        headers: reconciledHeaders
                        // Fidelity: Body is NOT provided to response triggers in AWS
                    }
                }, type));

                totalDurationMs += durationMs;

                if (timedOut) return { result: this._timeoutResponse(mod.filePath, type), logs: allLogs };

                // AWS Parity: "A function can read a query string, but cannot create or update one, for
                // origin response and viewer response events." The change is ignored.
                if (request.querystring !== originalQuerystring) {
                    request.querystring = originalQuerystring;
                    EdgeError.reportValidation('lambda', `${path.basename(mod.filePath)}: ${type} functions can't change the query string`, this.options.strict);
                }
                if (!result) continue;

                if (result.status) {
                    // AWS Parity: "Lambda@Edge functions for viewer response events cannot modify the HTTP status code"
                    if (type === 'viewer-response' && String(result.status) !== String(resData.status)) {
                        console.warn(`\x1b[33m⚠️  [Fidelity Warning] ${path.basename(mod.filePath)}: viewer-response functions can't change the status code (${resData.status} kept, ${result.status} ignored)\x1b[0m`);
                    } else {
                        resData.status = result.status;
                    }
                }
                if (result.statusDescription && type !== 'viewer-response') resData.statusDescription = result.statusDescription;
                if (result.body) resData.body = result.body;
                if (result.headers) {
                    const mutatedHeaders = this.headerManager.normalizeHeaders(result.headers);
                    this.headerManager.reconcile(mutatedHeaders, originalHeaders, type, this.options.strict);
                    reconciledHeaders = mutatedHeaders;
                }
                if (result.body) this._checkGeneratedResponseSize(type, reconciledHeaders, result.body);
            }
        }

        const response: any = { 
            headers: reconciledHeaders,
            status: String(resData.status || 200),
            statusDescription: resData.statusDescription || 'OK',
            body: resData.body,
            totalDurationMs: String(totalDurationMs),
            type: 'viewer-response'
        };

        return { result: response, logs: allLogs };
    }

    /**
     * Runaway guard: a handler still unsettled at the enforced guard (AWS timeout plus leeway) is
     * stopped with the 503 CloudFront returns for an exceeded Lambda@Edge limit.
     */
    private _timeoutResponse(filePath: string, type: HookType): any {
        const guard = type.startsWith('viewer-') ? AWS_LIMITS.VIEWER_TIMEOUT_GUARD_MS : AWS_LIMITS.ORIGIN_TIMEOUT_GUARD_MS;
        return {
            _isResponse: true,
            _timeout: true,
            status: '503',
            headers: { 'content-type': [{ key: 'Content-Type', value: 'text/plain' }] },
            body: `LambdaLimitExceeded: ${path.basename(filePath)} (${type}) did not complete within the ${guard / 1000}s emulator guard`
        };
    }

    /**
     * AWS Parity ("Quotas on Lambda@Edge"): a generated response, including headers and body, is
     * limited to 40 KB for viewer events and 1 MB for origin events. Exceeding it is a 502 validation error.
     */
    private _checkGeneratedResponseSize(type: HookType, headers: any, body: any): void {
        const limit = type.startsWith('viewer-') ? AWS_LIMITS.VIEWER_GENERATED_RESPONSE_BYTES : AWS_LIMITS.GENERATED_RESPONSE_BODY_BYTES;
        let size = body === undefined || body === null ? 0 : Buffer.byteLength(typeof body === 'string' ? body : JSON.stringify(body));
        for (const values of Object.values(this.headerManager.normalizeHeaders(headers || {}))) {
            for (const v of values) size += Buffer.byteLength(`${v.key}: ${v.value}\r\n`);
        }
        if (size <= limit) return;

        const msg = `Generated response too large: ${size} bytes exceeds the ${limit}-byte limit for ${type}`;
        if (this.options.strict) throw EdgeError.validation('lambda', msg);
        console.warn(`\x1b[33m⚠️  [Fidelity Warning] ${msg}\x1b[0m`);
    }

    private _invoke(handler: any, record: any, type: HookType): Promise<{ result: any; durationMs: number; timedOut?: boolean }> {
        return new Promise((resolve, reject) => {
            const limit = type.startsWith('viewer-') ? AWS_LIMITS.VIEWER_TIMEOUT_MS : AWS_LIMITS.ORIGIN_TIMEOUT_MS;
            const guard = type.startsWith('viewer-') ? AWS_LIMITS.VIEWER_TIMEOUT_GUARD_MS : AWS_LIMITS.ORIGIN_TIMEOUT_GUARD_MS;
            const startTime = process.hrtime.bigint();
            const cf = type.includes('response') ? { request: (record as any).request, response: (record as any).response } : { request: record };
            const event = { Records: [{ cf }] };
            const context = { functionName: 'edgeRunner', getRemainingTimeInMillis: () => Math.max(0, limit - Number(process.hrtime.bigint() - startTime) / 1e6) };

            let resolved = false;

            const failWithTimeout = () => {
                if (resolved) return;
                resolved = true;
                const durationMs = Number(process.hrtime.bigint() - startTime) / 1e6;
                resolve({ result: null, durationMs, timedOut: true });
            };

            // The AWS limit only warns, in every mode: local hardware and networks aren't AWS's.
            // The enforced guard (limit plus leeway) stops runaway code so it can't hang the request.
            let timer = setTimeout(() => {
                if (resolved) return;
                console.warn(`\x1b[33m⚠️  Fidelity Warning: Handler took exceeding the AWS ${limit / 1000}s limit\x1b[0m`);
                timer = setTimeout(failWithTimeout, Math.max(0, guard - limit));
            }, limit);

            // Support both Async and Callback (AWS Fidelity)
            const callback = (err: any, res: any) => {
                if (resolved) return;
                resolved = true;
                clearTimeout(timer);
                const endTime = process.hrtime.bigint();
                const durationMs = Math.max(0.01, (Number(endTime - startTime) / 1e6) - EdgeRunner.EDGE_OVERHEAD_MS);
                
                // AWS Parity: an unhandled exception or rejection is an execution error (503)
                if (err) reject(err instanceof EdgeError ? err : EdgeError.execution('lambda', `Unhandled error in ${type} hook: ${err?.message ?? String(err)}`));
                else resolve({ result: res, durationMs });
            };

            try {
                // Clinical Linkage: The handler now uses the global sandbox console, 
                // which automatically finds the logContext and pushes to the shared buffer.
                const result = handler(event, context, callback);
                
                // If it looks like a promise, wait for it
                if (result && typeof result.then === 'function') {
                    result.then((res: any) => callback(null, res)).catch(callback);
                }
                // If it's a sync function that returns directly (and didn't call callback)
                else if (result !== undefined && !resolved) {
                    callback(null, result);
                }
            } catch (e) {
                callback(e, null);
            }
        });
    }

    private _buildRequestRecord(req: any, bodyBuffer?: Buffer, bodyTruncated = false): any {
        const headers = req.headers || {};
        const host = headers.host || 'localhost';
        const urlObj = new URL(req.url || '/', `http://${host}`);
        // AWS Parity: disallowed headers are never exposed to edge functions
        const awsHeaders = HeaderManager.withoutDisallowed(this.headerManager.parseIncomingHeaders(req));

        let body: any = undefined;
        if (bodyBuffer) {
            body = {
                data: bodyBuffer.toString('base64'),
                encoding: 'base64',
                inputTruncated: bodyTruncated
            };
        }

        return {
            method: req.method || 'GET',
            uri: urlObj.pathname,
            querystring: urlObj.search.slice(1),
            headers: awsHeaders,
            clientIp: req.socket?.remoteAddress || '127.0.0.1',
            body
        };
    }

    private _deepClone(obj: any): any {
        try { return JSON.parse(JSON.stringify(obj)); } catch { return { ...obj }; }
    }
}
