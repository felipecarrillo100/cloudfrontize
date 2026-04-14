import fs from 'fs';
import path from 'path';
import { PassThrough } from 'stream';
import { EdgeRunner } from '../core/EdgeRunner';
import { CFFRunner } from '../core/CFFRunner';
import { OriginProvider } from './Providers';
import { Telemetry } from './Telemetry';
import { HookType, CacheBehavior } from '../core/types';
import { OriginSelector } from './OriginSelector';
import { HeaderManager } from '../core/HeaderManager';
import { CodeProcessor, TransformationLevel } from '../core/CodeProcessor';
import { HookUtility } from '../core/HookUtility';

export class Orchestrator {
    private headerManager = new HeaderManager();
    private hookRegistry: any[] = [];
    private disabledHookIds: Set<string> = new Set();
    private selector: OriginSelector;

    constructor(
        private edgeRunner: EdgeRunner | null,
        private cffRunner: CFFRunner | null,
        private providers: Record<string, OriginProvider>,
        private behaviors: CacheBehavior[],
        private telemetry: Telemetry,
        private config: any,
        private logStream: fs.WriteStream | null = null
    ) {
        this.selector = new OriginSelector(behaviors);
        this._initializeHookRegistry();
        this._setupRunnerListeners();
        this._startSafetyWatchdog();
    }

    private _startSafetyWatchdog() {
        // High Fidelity Safety: Monitor main thread health without adding per-request VM taxes.
        // If a CFF or L@E hook hangs in an infinite loop, this will detect the block and log a diagnostic warning.
        let lastTick = Date.now();
        setInterval(() => {
            const now = Date.now();
            const drift = now - lastTick - 1000;
            if (drift > 2000) {
                console.warn(`\x1b[31m🚨 [WATCHDOG] Main thread was blocked for ${Math.round(drift)}ms!\x1b[0m`);
                console.warn(`   This is likely due to an infinite loop or heavy synchronous code in a CFF/L@E hook.`);
                console.warn(`   Use '--strict' to fail immediately on execution errors.`);
            }
            lastTick = now;
        }, 1000).unref();
    }

    private _setupRunnerListeners() {
        const runners = [this.edgeRunner, this.cffRunner].filter(Boolean);
        for (const runner of runners) {
            runner!.on('build_error', (data) => {
                this.telemetry.broadcast({
                    id: 'SYSTEM_BUILD',
                    type: 'error',
                    details: data
                });
            });

            runner!.on('build_success', (data) => {
                this.telemetry.broadcast({
                    id: 'SYSTEM_BUILD',
                    type: 'stage',
                    details: { name: 'Build Success', ...data }
                });
            });
        }
    }

    private _initializeHookRegistry() {
        const hooks: any[] = [];
        // L@E
        const edgePath = this.edgeRunner?.getRunnerPath?.();
        if (edgePath && fs.existsSync(edgePath)) {
            if (fs.lstatSync(edgePath).isFile()) {
                const content = fs.readFileSync(edgePath, 'utf8');
                const stage = HookUtility.detectStage(content, path.basename(edgePath));
                hooks.push({ id: `${stage}-le-0`, type: 'Lambda@Edge', path: edgePath, stage });
            } else if (fs.lstatSync(edgePath).isDirectory()) {
                const files = fs.readdirSync(edgePath).filter(f => f.endsWith('.js')).sort();
                const counts: Record<string, number> = {};
                files.forEach((f) => {
                    const filePath = path.join(edgePath, f);
                    const content = fs.readFileSync(filePath, 'utf8');
                    const stage = HookUtility.detectStage(content, f);
                    const idx = counts[stage] || 0;
                    hooks.push({ id: `${stage}-le-${idx}`, type: 'Lambda@Edge', path: filePath, stage });
                    counts[stage] = idx + 1;
                });
            }
        }
        // CFF
        const cffPath = this.cffRunner?.getRunnerPath?.();
        if (cffPath) {
            if (fs.existsSync(cffPath) && fs.lstatSync(cffPath).isFile()) {
                const content = fs.readFileSync(cffPath, 'utf8');
                const stage = HookUtility.detectStage(content, path.basename(cffPath));
                hooks.push({ id: `${stage}-cff-0`, type: 'CloudFront Function', path: cffPath, stage });
            } else if (fs.existsSync(cffPath) && fs.lstatSync(cffPath).isDirectory()) {
                const files = fs.readdirSync(cffPath).filter(f => f.endsWith('.js')).sort();
                const counts: Record<string, number> = {};
                files.forEach((f) => {
                    const filePath = path.join(cffPath, f);
                    const content = fs.readFileSync(filePath, 'utf8');
                    const stage = HookUtility.detectStage(content, f);
                    const idx = counts[stage] || 0;
                    hooks.push({ id: `${stage}-cff-${idx}`, type: 'CloudFront Function', path: filePath, stage });
                    counts[stage] = idx + 1;
                });
            }
        }
        this.hookRegistry = hooks;
    }

    private broadcastStage(name: string, details: any, headers?: any) {
        if (headers) {
            // Fidelity Fix: Robustly clone headers as a plain object to prevent {} serialization
            details.headers = {};
            for (const [k, v] of Object.entries(headers)) {
                if (v !== undefined && v !== null) {
                    details.headers[k.toLowerCase()] = String(v);
                }
            }
        }
        // Deep sanitize metadata to prevent [object Object] leaks
        if (details.metadata && typeof details.metadata === 'object') {
            details.metadata = JSON.stringify(details.metadata, (_, v) => typeof v === 'object' && v !== null ? v : String(v), 2);
        }
        this.telemetry.broadcast({ id: (details as any).requestId, type: 'stage', details: { name, ...details } });
    }

    public getDistribution() {
        return {
            hooks: this.hookRegistry.map(h => ({
                ...h,
                disabled: this.disabledHookIds.has(h.id),
                code: fs.existsSync(h.path) ? fs.readFileSync(h.path, 'utf8') : '// Source not found'
            })),
            origins: this.config.origins || [],
            mode: this.config.mode,
            port: this.config.port
        };
    }

    public toggleHook(id: string, disabled: boolean): void {
        if (disabled) this.disabledHookIds.add(id);
        else this.disabledHookIds.delete(id);
    }

    public resetHooks(): void {
        this.disabledHookIds.clear();
    }

    public disableAllHooks(): void {
        for (const h of this.hookRegistry) {
            this.disabledHookIds.add(h.id);
        }
    }

    /**
     * Generates production-ready code with tiered transformations.
     */
    public async getProductionCode(hookId: string, level: TransformationLevel): Promise<string> {
        const hook = this.hookRegistry.find(h => h.id === hookId);
        if (!hook || !fs.existsSync(hook.path)) return '// Error: Hook path not found';

        const content = fs.readFileSync(hook.path, 'utf8');
        const isCff = hook.type.toLowerCase().includes('function');
        const bakeVars = isCff ? this.cffRunner?.getBakeVars() : this.edgeRunner?.getBakeVars();

        return await CodeProcessor.process(
            content,
            isCff ? 'cff' : 'edge',
            level,
            bakeVars || {}
        );
    }

    public isolateHook(id: string): void {
        this.disabledHookIds.clear();
        for (const h of this.hookRegistry) {
            if (h.id !== id) this.disabledHookIds.add(h.id);
        }
    }

    public getConfig() {
        return this.config;
    }

    private isDefaultSticky = false;

    private stickyHeaders: { request: any, response: any } = { request: {}, response: {} };

    public setStickyHeaders(config: any, isDefault = false) {
        this.stickyHeaders = {
            request: config.requestHeaders || {},
            response: config.responseHeaders || {}
        };
        this.isDefaultSticky = isDefault;
    }

    public getStickyHeaders() {
        return this.stickyHeaders;
    }

    private _syncHeadersToRequest(req: any, mutations: any, force = true) {
        this.headerManager.syncToRequest(req, mutations, force);
    }

    public async handleRequest(req: any, res: any, options: any, reqBody?: Buffer): Promise<void> {
        const requestId = require('crypto').randomBytes(4).toString('hex');
        const startTime = Date.now();
        const originalUrl = req.url;
        req.requestID = requestId;
        const logPrefix = `\x1b[90m[${requestId}]\x1b[0m`;
        req._logBuffer = [`${logPrefix} ${req.method} ${req.url} \x1b[90m(Host: ${req.headers.host || 'unknown'})\x1b[0m`];
        
        // Forensic Alignment: Log the initial request entrance to the Black Box
        this._logToFile('INFO', 'Orchestrator', requestId, `${req.method} ${req.url} (Host: ${req.headers.host || 'unknown'})`);
        
        // Initialize header sync (Sticky) and broadcast initial state
        this._syncHeadersToRequest(req, this.stickyHeaders.request, !this.isDefaultSticky);
        
        if (this.edgeRunner && options.strict) this.edgeRunner.options.strict = true;

        this.telemetry.broadcast({
            id: requestId,
            type: 'request',
            details: { method: req.method, url: req.url, headers: { ...req.headers } }
        });

        // Clinical Alignment: No JIT printing here. 
        // We buffer everything and flush atomically in _sendResponse.

        try {
            // Body drainage now handled at server entry point (index.ts) for maximum robustness
            if (req.method !== 'GET' && req.method !== 'HEAD' && !reqBody) {
                // Fallback for direct calls not through index.ts startServer (e.g. tests or direct usage)
                const chunks: any[] = [];
                for await (const chunk of req) chunks.push(chunk);
                reqBody = Buffer.concat(chunks);
            }

            // 1. CFF Viewer Request
            if (this.cffRunner) {
                const hooks = this.hookRegistry.filter(h => 
                    h.type === 'CloudFront Function' && 
                    h.stage === 'viewer-request' && 
                    !this.disabledHookIds.has(h.id)
                );
                
                for (const hook of hooks) {
                    const filename = path.basename(hook.path);
                    this.broadcastStage(`[CFF: viewer-request] ${filename}`, { requestId, uri: req.url, fid: hook.id }, HeaderManager.telemetryFlatten(req.headers));
                }

                const cffEvent = this.cffRunner.toCFFEvent(req, null, 'viewer-request');
                const { result: cffResult, logs: cffLogs } = await this.cffRunner.runChain('viewer-request', cffEvent, Array.from(this.disabledHookIds));
                const mutatedRequest = this.cffRunner.fromCFFEvent(cffResult);

                // Clinical Alignment: Capture hook logs into the block-level buffer.
                if (options.verbose && cffLogs.length > 0) {
                    req._logBuffer.push(...cffLogs);
                }

                if (mutatedRequest?._isResponse) {
                    this.broadcastStage('CFF Short-Circuit', { requestId, status: mutatedRequest.status, uri: req.url, fid: 'viewer-request-cff-0' }, HeaderManager.telemetryFlatten(mutatedRequest.headers));
                    if (options.verbose) {
                        req._logBuffer.push(`\x1b[90m[${requestId}]\x1b[0m \x1b[90m├─\x1b[0m ◈ \x1b[36m[CFF]\x1b[0m Generated Response`);
                    }
                    return this._sendResponse(res, mutatedRequest, requestId, startTime, req, options);
                }
                if (mutatedRequest?.url) {
                    if (options.verbose) {
                        req._logBuffer.push(`\x1b[90m[${requestId}]\x1b[0m \x1b[90m├─\x1b[0m ◈ \x1b[36m[CFF]\x1b[0m Viewer Request  \x1b[33m⟹\x1b[0m Rewrote to ${mutatedRequest.url}`);
                    }
                    req.url = mutatedRequest.url;
                }
                this._syncHeadersToRequest(req, mutatedRequest?.headers);
            }

            // 2. L@E Viewer Request / Origin Request
            if (this.edgeRunner) {
                const disabledIds = Array.from(this.disabledHookIds);
                const { result: edgeResult, logs: edgeLogs } = await this.edgeRunner.runRequestHook(req, reqBody, requestId, disabledIds);
                
                // Clinical Alignment: Capture hook logs into the block-level buffer.
                if (options.verbose && edgeLogs.length > 0) {
                    req._logBuffer.push(...edgeLogs);
                }

                // Fidelity: Re-broadcast executed stages for visual journey
                const filenames = this.hookRegistry
                    .filter(h => h.type === 'Lambda@Edge' && (h.stage === 'viewer-request' || h.stage === 'origin-request') && !this.disabledHookIds.has(h.id))
                    .map(h => path.basename(h.path));

                if (filenames.length > 0) {
                    this.broadcastStage(`[L@E: viewer-request] ${filenames.join(' + ')}`, { requestId, uri: req.url, fid: 'viewer-request-le-0' }, HeaderManager.telemetryFlatten(req.headers));
                }

                if (edgeResult?._isResponse) {
                    this.broadcastStage('L@E Short-Circuit', { requestId, status: edgeResult.status, uri: req.url, fid: edgeResult.id }, HeaderManager.telemetryFlatten(edgeResult.headers));
                    if (options.verbose) {
                        req._logBuffer.push(`\x1b[90m[${requestId}]\x1b[0m \x1b[90m├─\x1b[0m ◈ \x1b[35m[L@E]\x1b[0m Generated Response`);
                    }
                    return this._sendResponse(res, edgeResult, requestId, startTime, req, options);
                }
                const newUrl = edgeResult?.url || edgeResult?.uri;
                if (newUrl) {
                    if (options.verbose && req.url !== newUrl) {
                        req._logBuffer.push(`\x1b[90m[${requestId}]\x1b[0m \x1b[90m├─\x1b[0m ◈ \x1b[35m[L@E]\x1b[0m Origin Request  \x1b[33m⟹\x1b[0m Rewrote to ${newUrl}`);
                    }
                    req.url = newUrl;
                }
                this._syncHeadersToRequest(req, edgeResult?.headers);
            }

            // 3. Provider Selection
            const fallbackId = this.behaviors[this.behaviors.length - 1]?.targetOriginId || 'default';
            const targetOriginId = this.selector.select(req.url, fallbackId);
            const provider = this.providers[targetOriginId];

            if (!provider) throw new Error(`No provider found for origin ID: ${targetOriginId}`);

            // 4. Origin Fetch
            this.broadcastStage('Origin Fetch', { requestId, uri: req.url, origin: targetOriginId, fid: 'origin-request' }, req.headers);
            let { statusCode, headers, body, resolvedUri } = await this._fetchFromProvider(provider, req, options);
            this.broadcastStage('Origin Response', { requestId, status: statusCode, uri: resolvedUri || req.url, fid: 'origin-response' }, headers);
            
            // Fidelity Fallback: If rewritten URL 404s and not in strict mode, try original URL
            if (statusCode === 404 && !options.strict && req.url !== originalUrl) {
                console.warn(`\x1b[33m⚠️  [Fidelity Warning] Lambda rewritten URI to "${req.url}" but file was not found. Falling back to original URI: "${originalUrl}"\x1b[0m`);
                req.url = originalUrl;
                this._syncHeadersToRequest(req, null);
                const secondTry = await this._fetchFromProvider(provider, req, options);
                statusCode = secondTry.statusCode;
                headers = secondTry.headers;
                body = secondTry.body;
                resolvedUri = secondTry.resolvedUri;
            }

            if (options.verbose) {
                req._logBuffer.push(`\x1b[90m[${requestId}]\x1b[0m \x1b[90m├─\x1b[0m 🌐 \x1b[32m[Origin]\x1b[0m Fetch (${targetOriginId}) \x1b[33m⟹\x1b[0m ${resolvedUri || req.url}`);
            }

            // Diagnostic Capture: Store origin info for the Two-Row Access Summary
            req._originInfo = { id: targetOriginId, uri: resolvedUri || req.url };

            // Forensic Alignment: Log origin boundary crossing
            this._logToFile('INFO', 'Orchestrator', requestId, `Origin Fetch (${targetOriginId}) ⟹ ${resolvedUri || req.url}`);

            // 5. L@E Response Hooks
            let finalRes: any = {
                status: String(statusCode),
                headers: { ...this.stickyHeaders.response, ...headers }
            };

            if (this.edgeRunner) {
                const { result: edgeResResult, logs: edgeResLogs } = await this.edgeRunner.runResponseHook(req, {
                    status: statusCode,
                    headers: { ...this.stickyHeaders.response, ...headers }
                }, requestId, Array.from(this.disabledHookIds));

                // Clinical Alignment: Capture hook logs into the block-level buffer.
                if (options.verbose && edgeResLogs.length > 0) {
                    req._logBuffer.push(...edgeResLogs);
                }

                const activeLERes = this.hookRegistry.filter(h => h.type === 'Lambda@Edge' && (h.stage === 'viewer-response' || h.stage === 'origin-response') && !this.disabledHookIds.has(h.id));
                activeLERes.forEach(h => {
                    this.broadcastStage(`[L@E: viewer-response] ${path.basename(h.path)}`, { requestId, status: statusCode, uri: req.url, fid: h.id }, HeaderManager.telemetryFlatten(edgeResResult.headers));
                });

                finalRes = edgeResResult;
            }

            // 6. CFF Viewer Response
            if (this.cffRunner) {
                const hook = this.hookRegistry.find(h => h.type === 'CloudFront Function' && h.stage === 'viewer-response');
                const stageName = hook ? `[CFF: viewer-response] ${path.basename(hook.path)}` : '[CFF: viewer-response] Unknown';
                this.broadcastStage(stageName, { requestId, status: finalRes.status, uri: req.url, fid: hook?.id }, HeaderManager.telemetryFlatten(finalRes.headers));
                const cffResEvent = this.cffRunner.toCFFEvent(req, finalRes, 'viewer-response');
                const { result: cffResResult, logs: cffResLogs } = await this.cffRunner.runChain('viewer-response', cffResEvent);

                // Clinical Alignment: Capture hook logs into the block-level buffer.
                if (options.verbose && cffResLogs.length > 0) {
                    req._logBuffer.push(...cffResLogs);
                }

                const cffFinal = this.cffRunner.fromCFFEvent(cffResResult);
                if (cffFinal) {
                    finalRes = {
                        ...finalRes,
                        ...cffFinal,
                        headers: { ...(finalRes.headers || {}), ...(cffFinal.headers || {}) }
                    };
                }
            }

            this.broadcastStage('Final Response', { requestId, status: finalRes.status, uri: req.url }, HeaderManager.telemetryFlatten(finalRes.headers));
            this._sendResponse(res, finalRes, requestId, startTime, req, options, body);

        } catch (err: any) {
            this.telemetry.broadcast({
                id: requestId,
                type: 'error',
                details: { message: err.message, stack: err.stack }
            });
            if (!res.writableEnded) {
                res.statusCode = 502;
                res.end(`[Local Emulator] Bad Gateway: ${err.message}`);
            }
        }
    }

    private async _fetchFromProvider(provider: OriginProvider, req: any, options: any): Promise<{ statusCode: number; headers: any; body: Buffer; resolvedUri?: string }> {
        const capturedRes: any = new PassThrough();
        capturedRes.statusCode = 200;
        capturedRes.headers = {};
        capturedRes.bodyData = [];

        capturedRes.setHeader = (k: string, v: any) => { capturedRes.headers[k.toLowerCase()] = v; };
        capturedRes.writeHead = (code: number, headers?: any) => {
            capturedRes.statusCode = code;
            if (headers) {
                for (const [hk, hv] of Object.entries(headers)) capturedRes.setHeader(hk, hv);
            }
        };

        capturedRes.on('data', (chunk: Buffer) => capturedRes.bodyData.push(chunk));
        const streamFinished = new Promise((resolve) => capturedRes.on('finish', resolve));
        await provider.fetch(req, capturedRes, options);
        await streamFinished;

        return {
            statusCode: capturedRes.statusCode,
            headers: capturedRes.headers,
            body: Buffer.concat(capturedRes.bodyData),
            resolvedUri: capturedRes.resolvedUri
        };
    }

    private _sendResponse(res: any, responseData: any, requestId: string, startTime: number, req: any, options: any, originalBody?: Buffer): void {
        res.statusCode = Number(responseData.status || 200);
        
        const processedHeaders = new Set<string>();

        // 1. Fidelity Resolver Layer 1: Unwrap complex structures (Arrays, Objects, {value})
        if (responseData.headers) {
            const flat = HeaderManager.telemetryFlatten(responseData.headers);
            for (const [k, v] of Object.entries(flat)) {
                const lowerK = k.toLowerCase();
                processedHeaders.add(lowerK);
                res.setHeader(k, v);
            }
        }

        // 2. Fidelity Resolver Layer 2: pick up top-level convenince properties (flattened keys)
        for (const [k, v] of Object.entries(responseData)) {
            const lowerK = k.toLowerCase();
            if (lowerK === 'headers' || lowerK === 'status' || lowerK === 'statusdescription' || lowerK === 'body' || lowerK.startsWith('_')) continue;
            if (processedHeaders.has(lowerK)) continue;

            if (typeof v === 'string' || typeof v === 'number') {
                res.setHeader(k, String(v));
            }
        }

        const duration = Date.now() - startTime;
        const statusStr = res.statusCode >= 400 ? `\x1b[31m${res.statusCode}\x1b[0m` : `\x1b[32m${res.statusCode}\x1b[0m`;
        const logPrefix = `\x1b[90m[${requestId}]\x1b[0m`;

        if (options.verbose && req._logBuffer) {
            req._logBuffer.push(`${logPrefix} \x1b[90m╰─\x1b[0m [Response] Status: ${statusStr} [${duration}ms]`);
            
            // ATOMIC FLUSH: Print the entire contiguous story of the request in one go.
            console.log(req._logBuffer.join('\n') + '\n');
        } else if (!options.noBanner) {
            // Two-Row Access Summary for Baseline Visibility (when --debug is off)
            console.log(`${logPrefix} ${req.method} ${req.url} \x1b[33m⟹\x1b[0m ${statusStr} [${duration}ms]`);
            if (req._originInfo) {
                console.log(`${logPrefix} \x1b[90m╰─\x1b[0m \x1b[32m[Origin]\x1b[0m Fetch (${req._originInfo.id}) \x1b[33m⟹\x1b[0m ${req._originInfo.uri}\n`);
            } else {
                console.log(''); // Newline separator
            }
        }

        this.telemetry.broadcast({
            id: requestId,
            type: 'response',
            durationMs: duration,
            details: { status: res.statusCode, headers: HeaderManager.telemetryFlatten(res.getHeaders()) }
        });

        res.end(responseData.body || originalBody);

        // Forensic Alignment: Log the terminal response status
        this._logToFile('INFO', 'Orchestrator', requestId, `Response Status: ${res.statusCode} [${duration}ms]`);
    }

    private _logToFile(level: string, component: string, requestId: string, message: string): void {
        if (!this.logStream) return;
        try {
            const timestamp = new Date().toISOString();
            const logLine = `${timestamp}  [${requestId}]  [${level.toUpperCase()}]  [${component}]  ${message}\n`;
            this.logStream.write(logLine);
        } catch (err) {
            // Silently fail to avoid blocking request on logging errors
        }
    }
}
