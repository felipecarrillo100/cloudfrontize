import fs from 'fs';
import path from 'path';
import { AsyncLocalStorage } from 'async_hooks';
import vm from 'vm';
import { HotRunner } from './HotRunner';
import { HookType, Registry } from './types';
import { AWS_LIMITS, AWS_HEADERS, AWS_RUNTIME } from '../constants';
import { HeaderManager } from './HeaderManager';
import { CodeProcessor } from './CodeProcessor';
import { SnippetExtractor } from './SnippetExtractor';
import { HookUtility } from './HookUtility';
const hostRequire = require;


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

    private headerManager = new HeaderManager();

    /**
     * Initializes the EdgeRunner with a path to a single JS file or directory of hooks.
     * @param runnerPath - Absolute path to the edge function(s).
     * @param options - Execution options (strict mode, env paths, etc).
     */
    constructor(runnerPath: string, public options: any = {}) {
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
        this.envVars = { ...AWS_RUNTIME.DEFAULT_ENV, ...this._loadEnv(this.options.envPath) };
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

    protected _loadFile(filePath: string, registry: Registry): void {
        try {
            let content = fs.readFileSync(filePath, 'utf8');

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
                require: (id: string) => {
                    const type = HookUtility.detectStage(content, filePath);
                    
                    for (const forbidden of AWS_RUNTIME.FORBIDDEN_MODULES) {
                        if (id === forbidden || id.startsWith(forbidden + '/')) {
                            throw new Error(`Forbidden: ${id} is restricted in Lambda@Edge environment`);
                        }
                    }

                    if (type.includes('viewer')) {
                        const allowed = AWS_RUNTIME.ALLOWED_VIEWER.includes(id as any) || 
                                        AWS_RUNTIME.ALLOWED_VIEWER.some(a => id.startsWith(a + '/'));
                        if (!allowed) {
                            throw new Error(`Forbidden: ${id} is not available in Viewer hooks`);
                        }
                    }

                    return hostRequire(id);
                },
                process: {
                    // Stringify environment variables to avoid [object Object] (AWS Fidelity)
                    env: Object.fromEntries(
                        Object.entries({ ...process.env, ...this.envVars })
                            .map(([k, v]) => [k, (v === null || v === undefined) ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v))])
                    ),
                    nextTick: process.nextTick
                },
                setTimeout, clearTimeout, setInterval, clearInterval,
                Buffer, Promise, URL, URLSearchParams
            };
            sandbox.global = sandbox;


            const script = new vm.Script(content, { filename: filePath });
            script.runInNewContext(sandbox);

            const mod = sandbox.exports;
            const finalType = HookUtility.detectStage(content, filePath);

            if (mod.handler && finalType && registry[finalType]) {
                // Fidelity Check: AWS only allows one hook per type.
                if (registry[finalType].length > 0) {
                    console.warn(`\x1b[33m⚠️  [CloudFrontize] Warning: Multiple files for "${finalType}" detected. Only "${path.basename(registry[finalType][0].filePath)}" will be used.\x1b[0m`);
                    return;
                }
                registry[finalType].push({ 
                    id: `${finalType}-le-${registry[finalType].length}`, 
                    handler: mod.handler, 
                    filePath: filePath 
                });
                if (this.options.verbose) {
                    console.log(`\x1b[32m✅ [L@E] Build Success: ${path.basename(filePath)}\x1b[0m`);
                }
                this.emit('build_success', { type: 'edge', file: filePath });
            }
        } catch (err: any) {
            this.compileError = err.message;
            console.error(`\x1b[31m🛑 [EdgeRunner] Load Error (${path.basename(filePath)}): ${err.message}\x1b[0m`);
            
            const { line, col } = SnippetExtractor.parseError(err);
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

    public async runRequestHook(req: any, bodyBuffer?: Buffer, requestID = 'UNKNOWN', disabledIds: string[] = [], bodyTruncated = false): Promise<{ result: any; logs: string[] }> {
        const request = this._buildRequestRecord(req, bodyBuffer, bodyTruncated);
        let totalDurationMs = 0;
        const allLogs: string[] = [];
        let finalResult: any = null;

        for (const type of ['viewer-request', 'origin-request'] as HookType[]) {
            const mods = this.modules[type].filter(m => !disabledIds.includes(m.id));
            for (const mod of mods) {
                const originalHeaders = this._deepClone(request.headers);
                
                // Fidelity Check: AWS Limit: 40KB for Viewer Request (Strict)
                if (type === 'viewer-request' && bodyBuffer && bodyBuffer.length > AWS_LIMITS.VIEWER_REQUEST_BODY_BYTES) {
                    if (this.options.strict) {
                        return { result: { _isResponse: true, status: 502, body: 'Body too large for viewer-request', headers: { 'content-type': 'text/plain' } }, logs: allLogs };
                    }
                    console.warn(`\x1b[33m⚠️  [Fidelity Warning] Body too large for viewer-request hook\x1b[0m`);
                }

                if (this.options.verbose) {
                    allLogs.push(`\x1b[90m[${requestID}] \x1b[90m├─\x1b[0m \x1b[35m○ [L@E: ${type}] ${path.basename(mod.filePath)}\x1b[0m`);
                }

                const { result, durationMs } = await this.logContext.run({ 
                    requestId: requestID, 
                    hookType: type, 
                    filename: path.basename(mod.filePath),
                    logs: allLogs 
                }, () => this._invoke(mod.handler, request, type));
                totalDurationMs += durationMs;

                if (result === null && this.options.strict) return { result: { _timeout: true, totalDurationMs }, logs: allLogs };
                if (!result) continue;

                if (result.status || result.statusCode) {
                   const headers = this.headerManager.normalizeHeaders(result.headers);
                   const record: any = { headers };
                   record.status = String(result.status || result.statusCode);
                   record.body = result.body;

                   // Fidelity Check: Generated Response Limit (1MB)
                   if (record.body && record.body.length > AWS_LIMITS.GENERATED_RESPONSE_BODY_BYTES) {
                       if (this.options.strict) {
                           return { 
                               result: {
                                _isResponse: true, 
                                status: '502', 
                                body: 'Generated response too large', 
                                headers: { 'content-type': [{ key: 'Content-Type', value: 'text/plain' }] } 
                               },
                               logs: allLogs
                           };
                       }
                       console.warn(`\x1b[33m⚠️  [Fidelity Warning] Generated response exceeds 1MB limit\x1b[0m`);
                   }

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
                type: 'viewer-request' 
            };
        }

        return { result: finalResult, logs: allLogs };
    }

    public async runResponseHook(req: any, resData: any, requestID = 'UNKNOWN', stage?: HookType, disabledIds: string[] = []): Promise<{ result: any; logs: string[] }> {
        const request = this._buildRequestRecord(req);
        let totalDurationMs = 0;
        let reconciledHeaders = this.headerManager.normalizeHeaders(resData.headers || {});
        const allLogs: string[] = [];

        // If no specific stage is targetted, run both as per legacy behavior
        // But for forensic accuracy, forensic-aware callers should pass a stage.
        const stages = stage ? [stage] : (['origin-response', 'viewer-response'] as HookType[]);

        for (const type of stages) {
            const mods = this.modules[type].filter(m => !disabledIds.includes(m.id));
            for (const mod of mods) {
                const originalHeaders = this._deepClone(reconciledHeaders);

                if (this.options.verbose) {
                    allLogs.push(`\x1b[90m[${requestID}]\x1b[0m \x1b[90m├─\x1b[0m ○ \x1b[35m[L@E: ${type}]\x1b[0m ${path.basename(mod.filePath)}`);
                }

                const { result, durationMs } = await this.logContext.run({ 
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

                if (result === null && this.options.strict) return { result: { _timeout: true, totalDurationMs }, logs: allLogs };
                if (!result) continue;

                if (result.status) resData.status = result.status;
                if (result.statusDescription) resData.statusDescription = result.statusDescription;
                if (result.body) resData.body = result.body;
                if (result.headers) {
                    const mutatedHeaders = this.headerManager.normalizeHeaders(result.headers);
                    this.headerManager.reconcile(mutatedHeaders, originalHeaders, type, this.options.strict);
                    reconciledHeaders = mutatedHeaders;
                }
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
        
        // Final Response Size Check (Pass-through case)
        if (resData.body && resData.body.length > AWS_LIMITS.GENERATED_RESPONSE_BODY_BYTES) {
            if (this.options.strict) {
                return { 
                    result: {
                        _isResponse: true, 
                        status: '502', 
                        body: 'Generated response too large', 
                        headers: { 'content-type': [{ key: 'Content-Type', value: 'text/plain' }] } 
                    },
                    logs: allLogs
                };
            }
            console.warn(`\x1b[33m⚠️  [Fidelity Warning] Generated response exceeds 1MB limit\x1b[0m`);
        }

        return { result: response, logs: allLogs };
    }

    private _invoke(handler: any, record: any, type: HookType): Promise<{ result: any; durationMs: number }> {
        return new Promise((resolve, reject) => {
            const limit = type.startsWith('viewer-') ? AWS_LIMITS.VIEWER_TIMEOUT_MS : AWS_LIMITS.ORIGIN_TIMEOUT_MS;
            const startTime = process.hrtime.bigint();
            const cf = type.includes('response') ? { request: (record as any).request, response: (record as any).response } : { request: record };
            const event = { Records: [{ cf }] };
            const context = { functionName: 'edgeRunner', getRemainingTimeInMillis: () => Math.max(0, limit - Number(process.hrtime.bigint() - startTime) / 1e6) };

            let resolved = false;

            const timer = setTimeout(() => {
                if (resolved) return;
                if (this.options.strict) {
                    resolved = true;
                    const durationMs = Number(process.hrtime.bigint() - startTime) / 1e6;
                    resolve({ result: null, durationMs });
                } else {
                    console.warn(`\x1b[33m⚠️  Fidelity Warning: Handler took exceeding the AWS 5s limit\x1b[0m`);
                }
            }, limit);

            // Support both Async and Callback (AWS Fidelity)
            const callback = (err: any, res: any) => {
                if (resolved) return;
                resolved = true;
                clearTimeout(timer);
                const endTime = process.hrtime.bigint();
                const durationMs = Math.max(0.01, (Number(endTime - startTime) / 1e6) - EdgeRunner.EDGE_OVERHEAD_MS);
                
                if (err) reject(err);
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
        const awsHeaders = this.headerManager.parseIncomingHeaders(req);

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
