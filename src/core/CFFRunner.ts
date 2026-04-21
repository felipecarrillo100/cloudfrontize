import fs from 'fs';
import path from 'path';
import vm from 'vm';
import * as acorn from 'acorn';
import { HotRunner } from './HotRunner';
import { Registry, RunnerOptions, HookType } from './types';
import { CFFValidator } from './CFFValidator';
import { CodeProcessor } from './CodeProcessor';
import { SnippetExtractor } from './SnippetExtractor';
import { CFF_LIMITS, AWS_HEADERS } from '../constants';
import { HookUtility } from './HookUtility';

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
export class CFFRunner extends HotRunner {
    private validator: CFFValidator;
    private compileError: string | null = null;
    private scripts: Record<string, vm.Script> = {};
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
            // Clinical Fidelity: Calibrate with exactly zero VM options to match the Optimized hot-path
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
            noopScript.runInContext(context); // Clinical: No options (no watchdog setup tax)
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
            ? fs.readdirSync(this.runnerPath).filter(f => f.endsWith('.js'))
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

    protected _loadFile(filePath: string, registry: Registry): void {
        const filename = path.basename(filePath);
        try {
            let fileCode = fs.readFileSync(filePath, 'utf8');
            const type = HookUtility.detectStage(fileCode, filename);
            
            fileCode = CodeProcessor.bake(fileCode, this.bakeVars);

            const { valid, violations } = this.validator.validate(filename, fileCode);
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

            // VM Syntax Check
            try {
                new vm.Script(fileCode, { filename: filePath });
            } catch (err: any) {
                this.compileError = err.message;
                const { line } = SnippetExtractor.parseError(err);
                const snippet = SnippetExtractor.extract(filePath, line);

                this.emit('build_error', { 
                    type: 'CloudFront Function', 
                    file: path.basename(filePath),
                    path: filePath,
                    error: this.compileError,
                    line: line,
                    snippet: snippet
                });
                return;
            }

            if (fileCode.length > CFF_LIMITS.MAX_CODE_SIZE_BYTES) {
                console.warn(`⚠️  [CFF] Code size exceeds 10KB limit for ${filename}`);
            }

            if (this.options.outputPath) {
                const outFilePath = path.join(this.options.outputPath, filename);
                fs.mkdirSync(path.dirname(outFilePath), { recursive: true });
                fs.writeFileSync(outFilePath, fileCode);
            }

            const mod = { 
                id: `${type}-cff-${registry[type].length}`, 
                handler: fileCode, 
                filePath: filePath 
            };
            
            // Professional Fidelity: Pre-heat the JIT compiler to ensure "Hot" execution for the first request
            this._warmup(mod);
            
            registry[type].push(mod);
            if (this.options.verbose) {
                console.log(`\x1b[32m✅ [CFF] Build Success: ${path.basename(filePath)}\x1b[0m`);
            }
            this.emit('build_success', { type: 'cff', file: filePath });

        } catch (err: any) {
            console.error(`🛑 [CFF] Load Error: ${err.message}`);
        }
    }

    public async runChain(type: HookType, event: any, disabledIds: string[] = [], onHookComplete?: (mod: any, result: any) => void): Promise<{ result: any; logs: string[] }> {
        let currentEvent = event;
        const allLogs: string[] = [];

        for (const mod of this.modules[type]) {
            if (disabledIds.includes((mod as any).id)) {
                if (this.options.debug) {
                    console.log(`\x1b[90m[${event.context.requestId}] \x1b[36m[CFF]\x1b[0m Bypassing ${path.basename(mod.filePath)} (Manual Override)`);
                }
                continue;
            }

            if (this.options.verbose) {
                allLogs.push(`\x1b[90m[${event.context.requestId}] \x1b[90m├─\x1b[0m \x1b[36m○ [CFF: ${type}] ${path.basename(mod.filePath)}\x1b[0m`);
            }
            const { result, logs } = this._executeSync(mod, currentEvent, path.basename(mod.filePath), type);
            allLogs.push(...logs);

            if (result) {
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

        if (resData) {
            event.response = { statusCode: resData.status || 200, statusDescription: resData.statusDescription || 'OK', headers: {}, cookies: {} };
            for (const [key, value] of Object.entries(resData.headers || {})) {
                event.response.headers[key.toLowerCase()] = { value: String(Array.isArray(value) ? (value[0]?.value || value[0]) : value) };
            }
        }

        for (const [key, val] of Object.entries(req.headers || {})) {
            const lowerKey = key.toLowerCase();
            const value = String(Array.isArray(val) ? (val[0]?.value || val[0]) : val);
            event.request.headers[lowerKey] = { value };

            if (lowerKey === 'cookie') {
                value.split(';').forEach(cookieStr => {
                    const parts = cookieStr.split('=');
                    if (parts.length >= 2) {
                        const name = parts[0].trim();
                        const val = parts.slice(1).join('=').trim();
                        event.request.cookies[name] = { value: val };
                    }
                });
            }
        }
        url.searchParams.forEach((v, k) => { event.request.querystring[k] = { value: v }; });
        return event;
    }

    public fromCFFEvent(cffResponse: any): any {
        if (!cffResponse) return null;
        let target = cffResponse.response ? cffResponse.response : (cffResponse.request ? cffResponse.request : cffResponse);
        
        const headers = { ...target.headers };

        // Map CFF cookies back to Set-Cookie headers
        if (target.cookies) {
            const setCookies: string[] = [];
            for (const [name, cookie] of Object.entries(target.cookies)) {
                const c = cookie as any;
                let str = `${name}=${c.value}`;
                if (c.attributes) str += `; ${c.attributes}`;
                setCookies.push(str);
            }
            if (setCookies.length > 0) {
                headers['set-cookie'] = setCookies.map(v => ({ key: 'Set-Cookie', value: v }));
            }
        }

        if (target.statusCode || target.status) {
            return {
                status: target.statusCode || target.status,
                statusDescription: target.statusDescription || 'OK',
                headers,
                _isResponse: true
            };
        }
        if (target.method || target.uri) {
            return { url: target.uri, headers, _isResponse: false };
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
                // Ignore warmup errors
            }
        }
    }

    private _executeSync(mod: { handler: string; filePath: string }, event: any, filename: string, stage: string = 'viewer-request'): { result: any; cpuTimeMs: number; logs: string[] } {
        const logBuffer: Array<{ level: string; args: any[]; ts: number }> = [];

        const sandbox: any = {
            event: event,
            console: {
                // High Fidelity: Use Date.now() (numeric) to avoid expensive ISO string formatting inside the timed block
                log: (...args: any[]) => logBuffer.push({ level: 'log', args, ts: Date.now() }),
                error: (...args: any[]) => logBuffer.push({ level: 'error', args, ts: Date.now() }),
                warn: (...args: any[]) => logBuffer.push({ level: 'warn', args, ts: Date.now() }),
                info: (...args: any[]) => logBuffer.push({ level: 'info', args, ts: Date.now() }),
            },
            Math, JSON, Object, String, Array, Number, Date,
            Buffer: undefined, process: undefined, require: undefined
        };

        const context = vm.createContext(sandbox);
        const scriptCode = `${mod.handler}\nhandler(event);`;

        if (!this.scripts[mod.filePath]) {
            this.scripts[mod.filePath] = new vm.Script(scriptCode, {
                filename: path.basename(mod.filePath)
            });
        }
        const script = this.scripts[mod.filePath];

        const start = process.hrtime.bigint();
        try {
            // Zero-Overhead Execution: Removing per-request watchdogs to eliminate Wall-Clock Jitter.
            // Safety is managed by a process-wide watchdog in the Orchestrator.
            const result = script.runInContext(context);
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
                logBuffer.forEach(log => {
                    formattedLogs.push(this._log(log.level, log.args, event.context.requestId, filename, stage, log.ts));
                });
            }

            return { result, cpuTimeMs, logs: formattedLogs };
        } catch (err: any) {
            console.error(`🛑 [CFF] Execution Error in ${path.basename(mod.filePath)}: ${err.message}`);
            
            const formattedLogs: string[] = [];
            // Still flush any logs that occurred before the crash
            if (logBuffer.length > 0 && event.context.requestId !== 'warmup') {
                logBuffer.forEach(log => {
                    formattedLogs.push(this._log(log.level, log.args, event.context.requestId, filename, stage, log.ts));
                });
            }

            if (this.options.strict) throw err;
            return { result: null, cpuTimeMs: 0, logs: formattedLogs };
        }
    }

    private _log(level: string, args: any[], requestId: string, filename: string, stage: string, overrideTimestamp?: number): string {
        const timestamp = overrideTimestamp ? new Date(overrideTimestamp).toISOString() : new Date().toISOString();
        const type = `[CFF: ${stage}] ${filename}`;

        const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
        
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
