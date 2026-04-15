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
            // Fidelity Fix: Use the standard flattener to ensure UI parity (arrays, unwrapping)
            details.headers = HeaderManager.telemetryFlatten(headers);
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

    public disableAllHooks(disable: boolean = true): void {
        if (disable) {
            for (const h of this.hookRegistry) {
                this.disabledHookIds.add(h.id);
            }
        } else {
            this.disabledHookIds.clear();
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

        // AWS Fidelity: Standard CloudFront behavior is to normalize the Host header to lowercase
        if (req.headers.host) {
            req.headers.host = req.headers.host.toLowerCase();
        }

        // Body Forensics: Capture initial request body (L@E rules: POST/PUT/PATCH/DELETE, 40KB cap)
        const BODY_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
        const REQ_BODY_CAP = 40 * 1024;         // 40KB — L@E viewer/origin-request limit
        const RES_BODY_CAP = 10 * 1024;         // 10KB — WebUI display cap for response bodies
        let reqBodyMeta: { body: string; bodySize: number; bodyTruncated: boolean; contentType: string } | undefined;
        if (reqBody && reqBody.length > 0 && BODY_METHODS.includes(req.method)) {
            const slice = reqBody.slice(0, REQ_BODY_CAP);
            reqBodyMeta = {
                body: slice.toString('base64'),
                bodySize: reqBody.length,
                bodyTruncated: reqBody.length > REQ_BODY_CAP,
                contentType: req.headers['content-type'] || ''
            };
        }

        // Body Forensics: Pipeline body tracking helpers.
        // Contract: actual data on first capture/mutation; {bodyUnchanged:true} on pass-through; nothing if no body.
        const captureLeReqBody = (result: any): any => {
            if (!reqBodyMeta) return undefined;
            const lb = result?.body;
            if (lb?.action === 'replace' && lb?.data) {
                const raw = lb.encoding === 'base64'
                    ? Buffer.from(String(lb.data), 'base64')
                    : Buffer.from(String(lb.data || ''));
                const sl = raw.slice(0, REQ_BODY_CAP);
                return { body: sl.toString('base64'), bodySize: raw.length, bodyTruncated: raw.length > REQ_BODY_CAP, contentType: reqBodyMeta!.contentType };
            }
            return { bodyUnchanged: true };
        };
        const captureLeResBody = (result: any, prevMeta: any): any => {
            const rb = result?.body;
            // Response hooks return the body directly (not action: replace)
            if (rb !== undefined && rb !== null) {
                const encoding = result.bodyEncoding || 'text';
                const raw = encoding === 'base64'
                    ? Buffer.from(String(rb), 'base64')
                    : Buffer.from(String(rb));
                const sl = raw.slice(0, RES_BODY_CAP);
                return { body: sl.toString('base64'), bodySize: raw.length, bodyTruncated: raw.length > RES_BODY_CAP, contentType: (prevMeta?.contentType || 'text/plain') };
            }
            if (prevMeta) return { bodyUnchanged: true };
            return undefined;
        };
        // Live body state — updated as the pipeline progresses
        let liveReqBodyState: any = reqBodyMeta ? { bodyUnchanged: true } : undefined;
        let liveResBodyState: any = undefined;

        this.telemetry.broadcast({
            id: requestId,
            type: 'request',
            details: {
                name: 'Client Request',
                method: req.method,
                url: req.url,
                // Fidelity Fix: Harmonize initial request headers with Display Flattened format
                // Fidelity Fix: Use rawHeaders for wire-casing, but FALLBACK to req.headers if empty to prevent UI {} bugs
                headers: HeaderManager.telemetryFlatten((req.rawHeaders && req.rawHeaders.length > 0)
                    ? this.headerManager.parseIncomingHeaders(req.rawHeaders)
                    : req.headers),
                ...reqBodyMeta
            }
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

            // 1. CFF Viewer Request (Atomic Forensic Journey)
            if (this.cffRunner) {
                const cffEvent = this.cffRunner.toCFFEvent(req, null, 'viewer-request');
                const { result: cffResult, logs: cffLogs } = await this.cffRunner.runChain('viewer-request', cffEvent, Array.from(this.disabledHookIds), (mod, result) => {
                    const intermediateMutated = this.cffRunner.fromCFFEvent(result);
                    if (intermediateMutated) {
                        if (intermediateMutated.url) req.url = intermediateMutated.url;
                        this._syncHeadersToRequest(req, intermediateMutated.headers);
                    }
                    const filename = path.basename(mod.filePath);
                    this.broadcastStage(`[CFF: viewer-request] ${filename}`, { requestId, uri: req.url, fid: mod.id, ...liveReqBodyState }, HeaderManager.telemetryFlatten(req.headers));
                });

                const mutatedRequest = this.cffRunner.fromCFFEvent(cffResult);

                if (options.verbose && cffLogs.length > 0) req._logBuffer.push(...cffLogs);

                if (mutatedRequest?._isResponse) {
                    this.broadcastStage('CFF Short-Circuit', { requestId, status: mutatedRequest.status, uri: req.url, fid: 'viewer-request-cff-0' }, HeaderManager.telemetryFlatten(mutatedRequest.headers));
                    if (options.verbose) req._logBuffer.push(`\x1b[90m[${requestId}]\x1b[0m \x1b[90m├─\x1b[0m ◈ \x1b[36m[CFF]\x1b[0m Generated Response`);
                    return this._sendResponse(res, mutatedRequest, requestId, startTime, req, options);
                }
            }

            // 2. L@E Viewer Request (Atomic Phase)
            if (this.edgeRunner) {
                const disabledIds = Array.from(this.disabledHookIds);
                const viewerOnlyDisabled = this.hookRegistry.filter(h => h.stage === 'origin-request').map(h => h.id);
                const { result: viewerResult, logs: viewerLogs } = await this.edgeRunner.runRequestHook(req, reqBody, requestId, [...disabledIds, ...viewerOnlyDisabled]);


                if (options.verbose && viewerLogs.length > 0) req._logBuffer.push(...viewerLogs);

                // Body Roll-Forward (Viewer Request)
                if (viewerResult?.body?.action === 'replace') {
                    reqBody = Buffer.from(viewerResult.body.data, 'base64');
                }

                liveReqBodyState = captureLeReqBody(viewerResult);
                const viewerReqHooks = this.hookRegistry.filter(h => h.type === 'Lambda@Edge' && h.stage === 'viewer-request' && !this.disabledHookIds.has(h.id));
                if (viewerReqHooks.length > 0) {
                    this.broadcastStage(
                        `[L@E: viewer-request] ${viewerReqHooks.map(h => path.basename(h.path)).join(' + ')}`,
                        { requestId, uri: req.url, fid: viewerReqHooks[0].id, ...liveReqBodyState },
                        HeaderManager.telemetryFlatten((req.rawHeaders && req.rawHeaders.length > 0) ? this.headerManager.parseIncomingHeaders(req.rawHeaders) : req.headers)
                    );
                }

                if (viewerResult?._isResponse) {
                    this.broadcastStage('L@E Short-Circuit', { requestId, status: viewerResult.status, uri: req.url, fid: viewerResult.id }, HeaderManager.telemetryFlatten(viewerResult.headers));
                    if (options.verbose) req._logBuffer.push(`\x1b[90m[${requestId}]\x1b[0m \x1b[90m├─\x1b[0m ◈ \x1b[35m[L@E: viewer-request]\x1b[0m Generated Response`);
                    return this._sendResponse(res, viewerResult, requestId, startTime, req, options);
                }

                // Header Roll-Forward
                this.headerManager.syncToRequest(req, viewerResult?.headers, true);
                if (viewerResult?.url || viewerResult?.uri) req.url = viewerResult?.url || viewerResult?.uri;

                // 2b. L@E Origin Request (Atomic Phase)
                const originOnlyDisabled = this.hookRegistry.filter(h => h.stage === 'viewer-request').map(h => h.id);
                const { result: originResult, logs: originLogs } = await this.edgeRunner.runRequestHook(req, reqBody, requestId, [...disabledIds, ...originOnlyDisabled]);

                if (options.verbose && originLogs.length > 0) req._logBuffer.push(...originLogs);

                // Body Roll-Forward (Origin Request)
                if (originResult?.body?.action === 'replace') {
                    reqBody = Buffer.from(originResult.body.data, 'base64');
                }

                liveReqBodyState = captureLeReqBody(originResult);
                const originReqHooks = this.hookRegistry.filter(h => h.type === 'Lambda@Edge' && h.stage === 'origin-request' && !this.disabledHookIds.has(h.id));
                if (originReqHooks.length > 0) {
                    this.broadcastStage(
                        `[L@E: origin-request] ${originReqHooks.map(h => path.basename(h.path)).join(' + ')}`,
                        { requestId, uri: req.url, fid: originReqHooks[0].id, ...liveReqBodyState },
                        HeaderManager.telemetryFlatten((req.rawHeaders && req.rawHeaders.length > 0) ? this.headerManager.parseIncomingHeaders(req.rawHeaders) : req.headers)
                    );
                }

                if (originResult?._isResponse) {
                    this.broadcastStage('L@E Short-Circuit', { requestId, status: originResult.status, uri: req.url, fid: originResult.id }, HeaderManager.telemetryFlatten(originResult.headers));
                    if (options.verbose) req._logBuffer.push(`\x1b[90m[${requestId}]\x1b[0m \x1b[90m├─\x1b[0m ◈ \x1b[35m[L@E: origin-request]\x1b[0m Generated Response`);
                    return this._sendResponse(res, originResult, requestId, startTime, req, options);
                }

                const newUrl = originResult?.url || originResult?.uri;
                if (newUrl) {
                    if (options.verbose && req.url !== newUrl) {
                        req._logBuffer.push(`\x1b[90m[${requestId}]\x1b[0m \x1b[90m├─\x1b[0m ◈ \x1b[35m[L@E]\x1b[0m Origin Request  \x1b[33m⟹\x1b[0m Rewrote to ${newUrl}`);
                    }
                    req.url = newUrl;
                }
                // Header Roll-Forward
                this._syncHeadersToRequest(req, originResult?.headers);
            }

            // 3. Provider Selection
            const fallbackId = this.behaviors[this.behaviors.length - 1]?.targetOriginId || 'default';
            const targetOriginId = this.selector.select(req.url, fallbackId);
            const provider = this.providers[targetOriginId];

            if (!provider) throw new Error(`No provider found for origin ID: ${targetOriginId}`);

            // 4. Origin Fetch — body going to origin is the final post-L@E request body state
            // Fidelity Fix: Use rawHeaders for origin fetch snapshots, falling back to req.headers if empty
            this.broadcastStage('Origin Fetch', { requestId, uri: req.url, origin: targetOriginId, fid: 'origin-request', ...liveReqBodyState }, HeaderManager.telemetryFlatten((req.rawHeaders && req.rawHeaders.length > 0) ? this.headerManager.parseIncomingHeaders(req.rawHeaders) : req.headers));
            // High-Fidelity Origin Pulse (Body Re-injection)
            let { statusCode, headers, body, resolvedUri } = await this._fetchFromProvider(provider, req, options, reqBody);

            // Body Forensics: Capture origin response body (10KB WebUI cap) and initialize live response body state
            const resBodySlice = body.slice(0, RES_BODY_CAP);
            const resBodyMeta = body.length > 0 ? {
                body: resBodySlice.toString('base64'),
                bodySize: body.length,
                bodyTruncated: body.length > RES_BODY_CAP,
                contentType: (headers['content-type'] || headers['Content-Type'] || '') as string
            } : undefined;
            liveResBodyState = resBodyMeta; // Initialize: origin body is ground truth for response pipeline

            this.broadcastStage('Origin Response', { requestId, status: statusCode, uri: resolvedUri || req.url, fid: 'origin-response', ...resBodyMeta }, HeaderManager.telemetryFlatten(headers));

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

            // 4. Trace Response Hooks
            if (this.edgeRunner) {
                const disabledIds = Array.from(this.disabledHookIds);
                
                // 4a. L@E Origin Response (Atomic Phase)
                const originResOnlyDisabled = this.hookRegistry.filter(h => h.stage === 'viewer-response').map(h => h.id);
                const { result: originResResult, logs: originResLogs } = await this.edgeRunner.runResponseHook(req, {
                    status: statusCode,
                    headers: HeaderManager.telemetryFlatten(headers),
                    body: body ? body.toString('base64') : undefined
                }, requestId, 'origin-response', [...disabledIds, ...originResOnlyDisabled]);

                if (options.verbose && originResLogs.length > 0) req._logBuffer.push(...originResLogs);

                // State Roll-Forward (Origin Response -> Viewer Response)
                if (originResResult.status) statusCode = parseInt(String(originResResult.status));
                if (originResResult.headers) {
                    const normalizedHeaders = HeaderManager.telemetryFlatten(originResResult.headers);
                    Object.entries(normalizedHeaders).forEach(([k, v]) => { headers[k] = v; });
                }
                if (originResResult.body !== undefined && originResResult.body !== null) {
                    const encoding = originResResult.bodyEncoding || 'text';
                    body = encoding === 'base64'
                        ? Buffer.from(String(originResResult.body), 'base64')
                        : Buffer.from(String(originResResult.body));
                }

                liveResBodyState = captureLeResBody(originResResult, liveResBodyState);
                const originResHooks = this.hookRegistry.filter(h => h.type === 'Lambda@Edge' && h.stage === 'origin-response' && !this.disabledHookIds.has(h.id));
                originResHooks.forEach(h => {
                    this.broadcastStage(`[L@E: origin-response] ${path.basename(h.path)}`, { requestId, status: statusCode, uri: req.url, fid: h.id, ...liveResBodyState }, HeaderManager.telemetryFlatten(headers));
                });

                // 4b. L@E Viewer Response (Atomic Phase)
                const viewerResOnlyDisabled = this.hookRegistry.filter(h => h.stage === 'origin-response').map(h => h.id);
                const { result: viewerResResult, logs: viewerResLogs } = await this.edgeRunner.runResponseHook(req, {
                    status: statusCode,
                    headers: HeaderManager.telemetryFlatten(headers),
                    body: body ? body.toString('base64') : undefined
                }, requestId, 'viewer-response', [...disabledIds, ...viewerResOnlyDisabled]);

                if (options.verbose && viewerResLogs.length > 0) req._logBuffer.push(...viewerResLogs);

                // Final State Roll-Forward
                if (viewerResResult.status) statusCode = parseInt(String(viewerResResult.status));
                if (viewerResResult.headers) {
                    const normalizedHeaders = HeaderManager.telemetryFlatten(viewerResResult.headers);
                    Object.entries(normalizedHeaders).forEach(([k, v]) => { headers[k] = v; });
                }
                if (viewerResResult.body !== undefined && viewerResResult.body !== null) {
                    const encoding = viewerResResult.bodyEncoding || 'text';
                    body = encoding === 'base64'
                        ? Buffer.from(String(viewerResResult.body), 'base64')
                        : Buffer.from(String(viewerResResult.body));
                }

                liveResBodyState = captureLeResBody(viewerResResult, liveResBodyState);
                const viewerResHooks = this.hookRegistry.filter(h => h.type === 'Lambda@Edge' && h.stage === 'viewer-response' && !this.disabledHookIds.has(h.id));
                viewerResHooks.forEach(h => {
                    this.broadcastStage(`[L@E: viewer-response] ${path.basename(h.path)}`, { requestId, status: statusCode, uri: req.url, fid: h.id, ...liveResBodyState }, HeaderManager.telemetryFlatten(headers));
                });

                finalRes = {
                    status: statusCode,
                    headers: headers,
                    body: body
                };
            }

            // 6. CFF Viewer Response (Atomic Forensic Journey)
            if (this.cffRunner) {
                const cffResEvent = this.cffRunner.toCFFEvent(req, finalRes, 'viewer-response');
                const { result: cffResResult, logs: cffResLogs } = await this.cffRunner.runChain('viewer-response', cffResEvent, Array.from(this.disabledHookIds), (mod, result) => {
                    const cffFinal = this.cffRunner.fromCFFEvent(result);
                    if (cffFinal) {
                        finalRes = {
                            ...finalRes,
                            ...cffFinal,
                            headers: { ...(finalRes.headers || {}), ...(cffFinal.headers || {}) }
                        };
                    }
                    const stageName = `[CFF: viewer-response] ${path.basename(mod.filePath)}`;
                    this.broadcastStage(stageName, { requestId, status: finalRes.status, uri: req.url, fid: mod.id, ...(liveResBodyState ? { bodyUnchanged: true } : {}) }, HeaderManager.telemetryFlatten(finalRes.headers));
                });

                if (options.verbose && cffResLogs.length > 0) req._logBuffer.push(...cffResLogs);
            }

            // Final Response: body the viewer receives — same as last response body state (possibly mutated by L@E)
            this.broadcastStage('Final Response', { requestId, status: finalRes.status, uri: req.url, ...liveResBodyState }, HeaderManager.telemetryFlatten(finalRes.headers));
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

    private async _fetchFromProvider(provider: OriginProvider, req: any, options: any, body?: Buffer): Promise<{ statusCode: number; headers: any; body: Buffer; resolvedUri?: string }> {
        const capturedRes: any = new PassThrough();
        capturedRes.statusCode = 200;
        capturedRes.headers = {};
        capturedRes.bodyData = [];

        capturedRes.setHeader = (k: string, v: any) => {
            // Fidelity Fix: Preserve origin casing (stop forcing lowercase)
            capturedRes.headers[k] = v;
        };
        capturedRes.getHeader = (k: string) => {
            // HTTP headers are case-insensitive — check exact, lowercase, then scan
            const lower = k.toLowerCase();
            return capturedRes.headers[k] ?? capturedRes.headers[lower] ??
                Object.entries(capturedRes.headers).find(([hk]) => hk.toLowerCase() === lower)?.[1];
        };
        capturedRes.writeHead = (code: number, headers?: any) => {
            capturedRes.statusCode = code;
            if (headers) {
                for (const [hk, hv] of Object.entries(headers)) capturedRes.setHeader(hk, hv);
            }
        };

        capturedRes.on('data', (chunk: Buffer) => capturedRes.bodyData.push(chunk));

        // Provider contract: fetch() only resolves when the response is fully written
        await provider.fetch(req, capturedRes, options, body);

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
            details: { status: res.statusCode, headers: HeaderManager.telemetryFlatten(responseData.headers) }
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
