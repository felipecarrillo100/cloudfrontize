import fs from 'fs';
import path from 'path';
import { PassThrough } from 'stream';
import { EdgeRunner } from '../core/EdgeRunner';
import { CFFRunner } from '../core/CFFRunner';
import { OriginProvider } from './Providers';
import { Telemetry } from './Telemetry';
import { CacheBehavior, CloudFrontizeOptions, HookType } from '../core/types';
import { OriginSelector, ResolvedBehavior } from './OriginSelector';
import { HeaderManager } from '../core/HeaderManager';
import { CodeProcessor, TransformationLevel } from '../core/CodeProcessor';
import { AWS_HEADERS, AWS_LIMITS } from '../constants';
import type { StageInfo } from '../api/events';
import { HookRegistry } from './HookRegistry';
import { MultiOriginConfig } from './ConfigLoader';
import { EdgeError } from '../core/EdgeError';

/**
 * Options for configuring the Orchestrator.
 */
export interface OrchestratorOptions {
    edgeRunner: EdgeRunner | null;
    cffRunner: CFFRunner | null;
    providers: Record<string, OriginProvider>;
    behaviors: CacheBehavior[];
    telemetry: Telemetry;
    origins: MultiOriginConfig;
    port: number;
    mode: string;
    logStream?: fs.WriteStream | null;
}

/**
 * The core orchestration engine for the CloudFrontize pipeline.
 *
 * @namespace Backend
 * The Orchestrator is the "Brain" of the emulator. It manages the sequential execution of
 * CloudFront Functions (CFF) and Lambda@Edge (L@E) hooks, maintains header state via the
 * HeaderManager, and coordinates origin fetching through various providers.
 *
 * It follows a strict "Hook Highway" pattern mimicking the AWS CloudFront request life-cycle.
 *
 * @see {@link https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-at-the-edge.html | AWS Lambda@Edge}
 * @see {@link https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-functions.html | AWS CloudFront Functions}
 */
export class Orchestrator {
    private headerManager: HeaderManager;
    private hookRegistry: HookRegistry;
    private selector: OriginSelector;
    private edgeRunner: EdgeRunner | null;
    private cffRunner: CFFRunner | null;
    private providers: Record<string, OriginProvider>;
    private behaviors: CacheBehavior[];
    private telemetry: Telemetry;
    private origins: MultiOriginConfig;
    private logStream: fs.WriteStream | null;
    private watchdog: NodeJS.Timeout | null = null;

    /**
     * Initializes the CloudFrontize Orchestrator.
     * @param options - Configuration options for the orchestrator, including runners, providers, and runtime state.
     */
    constructor(private options: OrchestratorOptions) {
        this.selector = new OriginSelector(options.behaviors);
        this.hookRegistry = new HookRegistry(options.edgeRunner, options.cffRunner, options.telemetry, options.behaviors);
        this.telemetry = options.telemetry;
        this.edgeRunner = options.edgeRunner;
        this.cffRunner = options.cffRunner;
        this.providers = options.providers;
        this.behaviors = options.behaviors;
        this.origins = options.origins;
        this.logStream = options.logStream || null;
        this.headerManager = new HeaderManager();

        // Final Forensic Audit: Trigger initial build check ONLY after listeners are active.
        // This ensures synth errors present at startup are captured in the health registry.
        this.edgeRunner?.load();
        this.cffRunner?.load();

        this._startSafetyWatchdog();
    }

    private _startSafetyWatchdog() {
        // High Fidelity Safety: Monitor main thread health without adding per-request VM taxes.
        // If a CFF or L@E hook hangs in an infinite loop, this will detect the block and log a diagnostic warning.
        let lastTick = Date.now();
        this.watchdog = setInterval(() => {
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

    /** Stops the watchdog and detaches from the runners (the runners themselves are closed by their owner). */
    public dispose(): void {
        if (this.watchdog) clearInterval(this.watchdog);
        this.watchdog = null;
        this.hookRegistry.dispose();
    }

    // Hook registry discovery and state management extracted to HookRegistry.ts

    private broadcastStage(name: string, details: any, headers?: any, stage?: StageInfo) {
        if (stage) details.stage = stage;
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
            hooks: this.hookRegistry.getAllHooks().map(h => ({
                ...h,
                disabled: this.hookRegistry.hasDisabledHook(h.id),
                error: this.hookRegistry.getBuildError(h.path), // Metadata Hydration: Include health in core distribution
                code: fs.existsSync(h.path) ? fs.readFileSync(h.path, 'utf8') : '// Source not found'
            })),
            // Security: origin credentials never leave the backend
            // 3.x: functions are first-class; behaviors say which function runs on which event
            functions: this._distributionFunctions(),
            behaviors: this.selector.all().map(b => ({ key: b.key, pathPattern: b.pathPattern, origin: b.targetOriginId, functions: b.functions ?? null })),
            origins: (this.origins.origins || []).map((o: any) => {
                if (!o.credentials) return o;
                const { credentials, ...rest } = o;
                return { ...rest, credentials: { configured: true } };
            }),
            port: this.options.port,
            mode: this.options.mode
        };
    }

    private _distributionFunctions() {
        const seen = new Map<string, any>();
        for (const h of this.hookRegistry.getAllHooks()) {
            if (seen.has(h.id)) continue;
            seen.set(h.id, {
                id: h.id,
                type: h.type,
                path: h.path,
                disabled: this.hookRegistry.hasDisabledHook(h.id),
                error: this.hookRegistry.getBuildError(h.path)
            });
        }
        return [...seen.values()];
    }

    public getBuildErrors(): Record<string, any> {
        return this.hookRegistry.getBuildErrors();
    }

    public toggleHook(id: string, disabled: boolean): void {
        this.hookRegistry.toggleHook(id, disabled);

        this._broadcastDistribution();
    }

    public resetHooks(): void {
        this.hookRegistry.resetHooks();
        this._broadcastDistribution();
    }

    public disableAllHooks(disable: boolean = true): void {
        this.hookRegistry.disableAllHooks(disable);
        this._broadcastDistribution();
    }

    /**
     * Generates production-ready code with tiered transformations.
     */
    public async getProductionCode(hookId: string, level: TransformationLevel): Promise<string> {
        const hook = this.hookRegistry.getAllHooks().find(h => h.id === hookId);
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
        this.hookRegistry.isolateHook(id);
        this._broadcastDistribution();
    }

    public getConfig() {
        return this.options;
    }

    private isDefaultSticky = false;

    private stickyHeaders: { request: any, response: any } = { request: {}, response: {} };

    /**
     * Configures the sticky headers for the pipeline session.
     * Sticky headers are injected into every request/response in the pipeline,
     * allowing for persistent debugging overrides (e.g. forced authorization).
     *
     * @param config - The header configuration object.
     * @param isDefault - Whether these are the system default headers.
     */
    public setStickyHeaders(config: any, isDefault = false) {
        this.stickyHeaders = {
            request: config.requestHeaders || {},
            response: config.responseHeaders || {}
        };
        this.isDefaultSticky = isDefault;
    }

    /**
     * Gets the currently active sticky headers.
     * @returns The request and response sticky header maps.
     */
    public getStickyHeaders() {
        return this.stickyHeaders;
    }

    /**
     * Splits the simulated request headers into the viewer's own headers and the ones CloudFront adds
     * (AWS_HEADERS.CLOUDFRONT_ADDED). AWS: "CloudFront adds the headers after the viewer request event"
     * and, when the viewer sent a header with the same name, "CloudFront overwrites the header values
     * that were in the viewer request". With 2.x `defaultHeaders`, a header the viewer sent wins.
     */
    private _splitSimulatedHeaders(req: any): { viewer: Record<string, any>; cloudFront: Record<string, string> } {
        const viewer: Record<string, any> = {};
        const cloudFront: Record<string, string> = {};
        for (const [key, value] of Object.entries(this.stickyHeaders.request || {})) {
            const lower = key.toLowerCase();
            if (!(AWS_HEADERS.CLOUDFRONT_ADDED as readonly string[]).includes(lower)) { viewer[key] = value; continue; }
            if (value === null || value === undefined) continue;
            if (this.isDefaultSticky && req.headers[lower] !== undefined) continue;
            cloudFront[key] = String(value);
        }
        return { viewer, cloudFront };
    }

    /** CloudFront Functions have access to CloudFront-added headers: overlays them on a CFF event's request. */
    private _overlayCloudFrontHeaders(cffEvent: any, cloudFront: Record<string, string>) {
        for (const [key, value] of Object.entries(cloudFront)) cffEvent.request.headers[key.toLowerCase()] = { value };
    }

    /** Drops CloudFront-added headers a function returned unchanged, so they aren't synced as viewer headers. */
    private _withoutUnchangedCloudFrontHeaders(headers: any, cloudFront: Record<string, string>) {
        const normalized = HeaderManager.normalizeHeaders(headers || {});
        const out: Record<string, any> = {};
        for (const [lower, values] of Object.entries(normalized)) {
            const simulated = Object.entries(cloudFront).find(([k]) => k.toLowerCase() === lower)?.[1];
            if (simulated !== undefined && values.length === 1 && values[0].value === simulated) continue;
            out[lower] = values;
        }
        return out;
    }

    /**
     * Adds the CloudFront headers to the live request (origin-facing from here on) and returns a
     * viewer-facing view for viewer response functions: "Viewer-facing functions see the header value
     * from the viewer request, while origin-facing functions see the header value that CloudFront added."
     */
    private _addCloudFrontHeaders(req: any, cloudFront: Record<string, string>): any {
        const names = new Set(Object.keys(cloudFront).map(k => k.toLowerCase()));
        if (names.size === 0) return req;
        const viewerHeaders = { ...req.headers };
        const viewerRaw = [...(req.rawHeaders || [])];
        this.headerManager.injectHeaders(req, cloudFront, true);
        // Everything else (URL, method, socket) still follows the live request
        return Object.assign(Object.create(req), { headers: viewerHeaders, rawHeaders: viewerRaw });
    }

    private _syncHeadersToRequest(req: any, headers: any) {
        // Additive-only inject: used for CFF and sticky header propagation.
        // These are NOT Lambda return-value syncs — they must never delete headers.
        this.headerManager.injectHeaders(req, headers);
    }

    /**
     * The primary entry point for processing an HTTP request through the CloudFront pipeline.
     *
     * This method executes the full "Hook Highway":
     * 1. CFF Viewer Request
     * 2. L@E Viewer Request
     * 3. L@E Origin Request
     * 4. Origin Fetch (S3/Local)
     * 5. L@E Origin Response
     * 6. L@E Viewer Response
     * 7. CFF Viewer Response
     *
     * It handles body truncation, short-circuits, and forensic broadcasting.
     *
     * @param req - The incoming Node.js request object.
     * @param res - The outgoing Node.js response object.
     * @param options - Execution options (e.g. strict mode, verbose logging).
     * @param reqBody - The pre-drained request body Buffer, if any.
     * @returns A promise that resolves when the response has been fully served.
     *
     * @throws {Error} If no provider is found for the matching origin.
     */
    public async handleRequest(req: any, res: any, options: CloudFrontizeOptions, reqBody?: Buffer): Promise<void> {
        // A test request from the WebUI API comes with its id (see INVOKE_HEADER in createServer)
        const requestId: string = req.presetRequestId ?? require('crypto').randomBytes(4).toString('hex');
        const startTime = Date.now();
        const originalUrl = req.url;
        req.requestID = requestId;
        const logPrefix = `\x1b[90m[${requestId}]\x1b[0m`;
        req._logBuffer = [`${logPrefix} ${req.method} ${req.url} \x1b[90m(Host: ${req.headers.host || 'unknown'})\x1b[0m`];

        // AWS Parity: the cache behavior is chosen from the viewer's URI before any function runs.
        // "If a function changes the URI for a request, that doesn't change the cache behavior."
        const behavior = this.selector.match(originalUrl);
        const behaviorHooks = this._hooksFor(behavior);

        // 0. Build Health Check: AWS Parity - Return 502 if a function this behavior uses failed to build
        for (const hook of behaviorHooks) {
            if (!this.hookRegistry.hasDisabledHook(hook.id) && this.hookRegistry.hasBuildError(hook.path)) {
                const error = this.hookRegistry.getBuildError(hook.path);
                const awsErrorCode = hook.type.toLowerCase().includes('function') ? 'CloudFrontFunctionExecutionError' : 'LambdaExecutionError';

                res.statusCode = 502;
                res.setHeader('Content-Type', 'application/xml');
                res.end(`<?xml version="1.0" encoding="UTF-8"?>
<Error>
    <Code>${awsErrorCode}</Code>
    <Message>The hook ${path.basename(hook.path)} failed to build and cannot be executed${error?.error ? `: ${String(error.error).replace(/[<>&'"]/g, (c: string) => `&#${c.charCodeAt(0)};`)}` : '.'}</Message>
    <RequestId>${requestId}</RequestId>
</Error>`);

                this.telemetry.broadcast({
                    id: requestId,
                    type: 'error',
                    details: { message: `Blocked by syntax error in ${path.basename(hook.path)}`, error }
                });
                return;
            }
        }

        // Forensic Alignment: Log the initial request entrance to the Black Box
        this._logToFile('INFO', 'Orchestrator', requestId, `${req.method} ${req.url} (Host: ${req.headers.host || 'unknown'})`);

        // Initialize header sync (Sticky) and broadcast initial state
        // CloudFront-added headers are kept aside and applied where AWS exposes them (see _splitSimulatedHeaders)
        const simulated = this._splitSimulatedHeaders(req);
        this.headerManager.injectHeaders(req, simulated.viewer, !this.isDefaultSticky);
        let viewerFacingReq: any = req;
        let cloudFrontHeadersAdded = false;
        const addCloudFrontHeaders = () => {
            if (cloudFrontHeadersAdded) return;
            cloudFrontHeadersAdded = true;
            viewerFacingReq = this._addCloudFrontHeaders(req, simulated.cloudFront);
        };

        // AWS Fidelity: Standard CloudFront behavior is to normalize the Host header to lowercase
        if (req.headers.host) {
            req.headers.host = req.headers.host.toLowerCase();
        }

        // Body Forensics: Capture initial request body (L@E rules: POST/PUT/PATCH/DELETE, 40KB cap)
        const BODY_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
        let reqBodyMeta: { body: string; bodySize: number; bodyTruncated: boolean; contentType: string } | undefined;
        if (this.telemetry.recording && reqBody && reqBody.length > 0 && BODY_METHODS.includes(req.method)) {
            const slice = reqBody.slice(0, AWS_LIMITS.VIEWER_REQUEST_BODY_BYTES);
            reqBodyMeta = {
                body: slice.toString('base64'),
                bodySize: reqBody.length,
                bodyTruncated: reqBody.length > AWS_LIMITS.VIEWER_REQUEST_BODY_BYTES,
                contentType: (req.headers['content-type'] || 'application/octet-stream') as string
            };
        }

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
                headers: this._headerSnapshot(req),
                ...reqBodyMeta
            }
        });

        // Clinical Alignment: No JIT printing here.
        // We buffer everything and flush atomically in _sendResponse.

        try {
            this._checkViewerEventMixing(options, behaviorHooks);

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
                this._overlayCloudFrontHeaders(cffEvent, simulated.cloudFront);
                let lastCffId = '';
                const { result: cffResult, logs: cffLogs } = await this.cffRunner.runStage('viewer-request', this._stageFunctions(behavior, 'viewer-request').cff, cffEvent, (mod, result) => {
                    lastCffId = mod.id;
                    const intermediateMutated = this.cffRunner!.fromCFFEvent(result);
                    if (intermediateMutated) {
                        this._syncUrlToRequest(req, intermediateMutated);
                        this._syncHeadersToRequest(req, this._withoutUnchangedCloudFrontHeaders(intermediateMutated.headers, simulated.cloudFront));
                    }
                    const filename = path.basename(mod.filePath);
                    this.broadcastStage(`[CFF: viewer-request] ${filename}`, { requestId, uri: req.url, fid: mod.id, ...liveReqBodyState }, HeaderManager.telemetryFlatten(req.headers), { kind: 'function', event: 'viewer-request', runtime: 'cloudfront-function', functionIds: [mod.id] });
                });

                const mutatedRequest = this.cffRunner.fromCFFEvent(cffResult);

                if (options.verbose && cffLogs.length > 0) req._logBuffer.push(...cffLogs);

                if (mutatedRequest?._isResponse) {
                    this.broadcastStage('CFF Short-Circuit', { requestId, status: mutatedRequest.status, uri: req.url, fid: lastCffId }, HeaderManager.telemetryFlatten(mutatedRequest.headers), { kind: 'short-circuit', event: 'viewer-request', runtime: 'cloudfront-function', functionIds: lastCffId ? [lastCffId] : [] });
                    if (options.verbose) req._logBuffer.push(`\x1b[90m[${requestId}]\x1b[0m \x1b[90m├─\x1b[0m ◈ \x1b[36m[CFF]\x1b[0m Generated Response`);
                    return this._sendResponse(res, mutatedRequest, requestId, startTime, req, options);
                }
            }

            // 2. L@E Request Hooks
            liveReqBodyState = reqBodyMeta;
            if (this.edgeRunner) {
                const viewerRequestIds = this._stageFunctions(behavior, 'viewer-request').lae;

                // AWS Parity: the body exposed to a viewer request function is truncated at 40 KB (inputTruncated)
                const reqBodyTruncated = reqBody ? reqBody.length > AWS_LIMITS.VIEWER_REQUEST_BODY_BYTES : false;
                const reqBodySlice = reqBody ? reqBody.slice(0, AWS_LIMITS.VIEWER_REQUEST_BODY_BYTES) : undefined;

                const { result: viewerResult, logs: viewerLogs, exposedHeaders: viewerExposedHeaders } = await this.edgeRunner.runRequestStage('viewer-request', viewerRequestIds, req, reqBodySlice, requestId, reqBodyTruncated);


                if (options.verbose && viewerLogs.length > 0) req._logBuffer.push(...viewerLogs);

                // Body Roll-Forward (Viewer Request)
                if (viewerResult?.body?.action === 'replace') {
                    this._checkReplacedBodySize('viewer-request', viewerResult.body, options);
                    reqBody = this._decodeRequestBody(viewerResult.body);
                }

                liveReqBodyState = Telemetry.captureLeReqBody(viewerResult, reqBodyMeta);
                if (viewerRequestIds.length > 0) {
                    this.broadcastStage(
                        `[L@E: viewer-request] ${this._fileNames(this.edgeRunner, viewerRequestIds)}`,
                        { requestId, uri: req.url, fid: viewerRequestIds[0], ...liveReqBodyState },
                        this._headerSnapshot(req),
                        { kind: 'function', event: 'viewer-request', runtime: 'lambda-edge', functionIds: viewerRequestIds }
                    );
                }

                if (viewerResult?._isResponse) {
                    this.broadcastStage('L@E Short-Circuit', { requestId, status: viewerResult.status, uri: req.url, fid: viewerResult.id }, HeaderManager.telemetryFlatten(viewerResult.headers), { kind: 'short-circuit', event: 'viewer-request', runtime: 'lambda-edge', functionIds: [viewerResult.id] });
                    if (options.verbose) req._logBuffer.push(`\x1b[90m[${requestId}]\x1b[0m \x1b[90m├─\x1b[0m ◈ \x1b[35m[L@E: viewer-request]\x1b[0m Generated Response`);
                    return this._sendResponse(res, viewerResult, requestId, startTime, req, options);
                }

                // Header Roll-Forward: Exposure Boundary sync (L@E viewer-request)
                this.headerManager.syncToRequest(req, viewerResult?.headers ?? {}, viewerExposedHeaders);
                this._syncUrlToRequest(req, viewerResult);

                // AWS Parity: CloudFront adds its headers after the viewer request event
                addCloudFrontHeaders();

                // 2b. L@E Origin Request (Atomic Phase)
                const originRequestIds = this._stageFunctions(behavior, 'origin-request').lae;

                // Fidelity & Performance: Slicing the input body for the Origin Request Lambda snapshot
                const originReqBodyTruncated = reqBody ? reqBody.length > AWS_LIMITS.LE_BODY_INPUT_CAP_BYTES : false;
                const originReqBodySlice = reqBody ? reqBody.slice(0, AWS_LIMITS.LE_BODY_INPUT_CAP_BYTES) : undefined;

                const { result: originResult, logs: originLogs, exposedHeaders: originExposedHeaders } = await this.edgeRunner.runRequestStage('origin-request', originRequestIds, req, originReqBodySlice, requestId, originReqBodyTruncated);

                if (options.verbose && originLogs.length > 0) req._logBuffer.push(...originLogs);

                // Body Roll-Forward (Origin Request)
                if (originResult?.body?.action === 'replace') {
                    this._checkReplacedBodySize('origin-request', originResult.body, options);
                    reqBody = this._decodeRequestBody(originResult.body);
                }

                liveReqBodyState = Telemetry.captureLeReqBody(originResult, reqBodyMeta);
                if (originRequestIds.length > 0) {
                    this.broadcastStage(
                        `[L@E: origin-request] ${this._fileNames(this.edgeRunner, originRequestIds)}`,
                        { requestId, uri: req.url, fid: originRequestIds[0], ...liveReqBodyState },
                        this._headerSnapshot(req),
                        { kind: 'function', event: 'origin-request', runtime: 'lambda-edge', functionIds: originRequestIds }
                    );
                }

                if (originResult?._isResponse) {
                    this.broadcastStage('L@E Short-Circuit', { requestId, status: originResult.status, uri: req.url, fid: originResult.id }, HeaderManager.telemetryFlatten(originResult.headers), { kind: 'short-circuit', event: 'origin-request', runtime: 'lambda-edge', functionIds: [originResult.id] });
                    if (options.verbose) req._logBuffer.push(`\x1b[90m[${requestId}]\x1b[0m \x1b[90m├─\x1b[0m ◈ \x1b[35m[L@E: origin-request]\x1b[0m Generated Response`);
                    return this._sendResponse(res, originResult, requestId, startTime, req, options);
                }

                if (originResult?.url || originResult?.uri || originResult?.querystring) {
                    const oldUrl = req.url;
                    this._syncUrlToRequest(req, originResult);
                    if (options.verbose && req.url !== oldUrl) {
                        req._logBuffer.push(`\x1b[90m[${requestId}]\x1b[0m \x1b[90m├─\x1b[0m ◈ \x1b[35m[L@E]\x1b[0m Origin Request  \x1b[33m⟹\x1b[0m Rewrote to ${req.url}`);
                    }
                }
                // Header Roll-Forward: Exposure Boundary sync (L@E origin-request)
                this.headerManager.syncToRequest(req, originResult?.headers ?? {}, originExposedHeaders);
            }

            addCloudFrontHeaders();

            // 3. Provider Selection
            // The behavior (matched on the viewer's original URI) decides the origin; URI rewrites don't
            const fallbackId = this.behaviors[this.behaviors.length - 1]?.targetOriginId || 'default';
            const targetOriginId = behavior?.targetOriginId ?? fallbackId;
            const provider = this.providers[targetOriginId];

            if (!provider) throw new Error(`No provider found for origin ID: ${targetOriginId}`);

            // 4. Origin Fetch — body going to origin is the final post-L@E request body state
            // Fidelity Fix: Use rawHeaders for origin fetch snapshots, falling back to req.headers if empty
            this.broadcastStage('Origin Fetch', { requestId, uri: req.url, origin: targetOriginId, fid: 'origin-request', ...liveReqBodyState }, this._headerSnapshot(req), { kind: 'origin-fetch', origin: targetOriginId });
            // High-Fidelity Origin Pulse (Body Re-injection)
            let { statusCode, headers, body, resolvedUri } = await this._fetchFromProvider(provider, req, options, reqBody);

            // --single (SPA mode): serve /index.html for missing objects, like a CloudFront custom error response.
            // 403 is included because S3 behind OAC answers 403 (not 404) for missing keys.
            if (options.single && (req.method === 'GET' || req.method === 'HEAD') && (statusCode === 404 || statusCode === 403)) {
                const requestedUrl = req.url;
                const [, qs] = requestedUrl.split('?');
                req.url = '/index.html' + (qs ? `?${qs}` : '');
                const fallback = await this._fetchFromProvider(provider, req, options, reqBody);
                req.url = requestedUrl;
                if (fallback.statusCode === 200) {
                    ({ statusCode, headers, body, resolvedUri } = fallback);
                }
            }

            // --no-etag: drop the origin's ETag before any hook sees it
            if (options.etag === false) {
                for (const k of Object.keys(headers)) {
                    if (k.toLowerCase() === 'etag') delete headers[k];
                }
            }

            // Simulation Layer: Inject sticky response headers (simulating Origin/S3 headers)
            // so they are visible to all subsequent hooks (Fidelity Requirement).
            Object.entries(this.stickyHeaders.response).forEach(([k, v]) => {
                if (!this.isDefaultSticky || headers[k] === undefined) {
                    headers[k] = v;
                }
            });

            // AWS Parity: "CloudFront doesn't invoke edge functions for viewer response events when the
            // origin returns HTTP status code 400 or higher." (origin response functions still run)
            const skipViewerResponse = statusCode >= 400;

            // Body Forensics: Capture origin response body (1MB snapshot) and initialize live response body state
            const resBodySlice = body.slice(0, AWS_LIMITS.TRAFFIC_BODY_SNAPSHOT_BYTES);
            const resBodyMeta = this.telemetry.recording && body.length > 0 ? {
                body: resBodySlice.toString('base64'),
                bodySize: body.length,
                bodyTruncated: body.length > AWS_LIMITS.TRAFFIC_BODY_SNAPSHOT_BYTES,
                contentType: (headers['content-type'] || headers['Content-Type'] || '') as string
            } : undefined;
            liveResBodyState = resBodyMeta; // Initialize: origin body is ground truth for response pipeline

            this.broadcastStage('Origin Response', { requestId, status: statusCode, uri: resolvedUri || req.url, fid: 'origin-response', ...resBodyMeta }, HeaderManager.telemetryFlatten(headers), { kind: 'origin-response' });

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
                // 4a. L@E Origin Response (Atomic Phase)
                const originResponseIds = this._stageFunctions(behavior, 'origin-response').lae;
                const { result: originResResult, logs: originResLogs } = await this.edgeRunner.runResponseStage('origin-response', originResponseIds, req, {
                    status: statusCode,
                    headers: headers
                    // Fidelity: Body is strictly NOT provided to response triggers in AWS
                }, requestId);

                if (options.verbose && originResLogs.length > 0) req._logBuffer.push(...originResLogs);

                // Runaway guard: AWS returns 503 and skips the remaining hooks
                if (originResResult._timeout) return this._sendResponse(res, originResResult, requestId, startTime, req, options);

                // State Roll-Forward (Origin Response -> Viewer Response)
                if (originResResult.status) statusCode = parseInt(String(originResResult.status));
                if (originResResult.headers) {
                    headers = HeaderManager.telemetryFlatten(originResResult.headers);
                }
                body = this._applyHookBody(originResResult, body);

                if (this.telemetry.recording) liveResBodyState = Telemetry.captureLeResBody(originResResult, liveResBodyState);
                originResponseIds.forEach(id => {
                    this.broadcastStage(`[L@E: origin-response] ${this._fileNames(this.edgeRunner, [id])}`, { requestId, status: statusCode, uri: req.url, fid: id, ...liveResBodyState }, HeaderManager.telemetryFlatten(headers), { kind: 'function', event: 'origin-response', runtime: 'lambda-edge', functionIds: [id] });
                });

                // 4b. L@E Viewer Response (Atomic Phase) — not invoked for origin errors
                if (!skipViewerResponse) {
                    const viewerResponseIds = this._stageFunctions(behavior, 'viewer-response').lae;
                    const { result: viewerResResult, logs: viewerResLogs } = await this.edgeRunner.runResponseStage('viewer-response', viewerResponseIds, viewerFacingReq, {
                        status: statusCode,
                        headers: headers
                        // Fidelity: Body is strictly NOT provided to response triggers in AWS
                    }, requestId);

                    if (options.verbose && viewerResLogs.length > 0) req._logBuffer.push(...viewerResLogs);

                    // Runaway guard: AWS returns 503 and skips the remaining hooks
                    if (viewerResResult._timeout) return this._sendResponse(res, viewerResResult, requestId, startTime, req, options);

                    // Final State Roll-Forward
                    if (viewerResResult.status) statusCode = parseInt(String(viewerResResult.status));
                    if (viewerResResult.headers) {
                        headers = HeaderManager.telemetryFlatten(viewerResResult.headers);
                    }
                    body = this._applyHookBody(viewerResResult, body);

                    if (this.telemetry.recording) liveResBodyState = Telemetry.captureLeResBody(viewerResResult, liveResBodyState);
                    viewerResponseIds.forEach(id => {
                        this.broadcastStage(`[L@E: viewer-response] ${this._fileNames(this.edgeRunner, [id])}`, { requestId, status: statusCode, uri: req.url, fid: id, ...liveResBodyState }, HeaderManager.telemetryFlatten(headers), { kind: 'function', event: 'viewer-response', runtime: 'lambda-edge', functionIds: [id] });
                    });
                } else if (options.verbose) {
                    req._logBuffer.push(`\x1b[90m[${requestId}]\x1b[0m \x1b[90m├─\x1b[0m ◈ \x1b[35m[L@E: viewer-response]\x1b[0m Skipped (origin returned ${statusCode})`);
                }

                finalRes = {
                    status: statusCode,
                    headers: headers,
                    body: body
                };
            }

            // 6. CFF Viewer Response (Atomic Forensic Journey) — not invoked for origin errors
            if (this.cffRunner && !skipViewerResponse) {
                const cffResEvent = this.cffRunner.toCFFEvent(req, finalRes, 'viewer-response');
                const { result: cffResResult, logs: cffResLogs } = await this.cffRunner.runStage('viewer-response', this._stageFunctions(behavior, 'viewer-response').cff, cffResEvent, (mod, result) => {
                    const cffFinal = this.cffRunner!.fromCFFEvent(result);
                    if (cffFinal) {
                        finalRes = {
                            ...finalRes,
                            ...cffFinal,
                            headers: cffFinal.headers || finalRes.headers
                        };
                    }
                    const stageName = `[CFF: viewer-response] ${path.basename(mod.filePath)}`;
                    this.broadcastStage(stageName, { requestId, status: finalRes.status, uri: req.url, fid: mod.id, ...(liveResBodyState ? { bodyUnchanged: true } : {}) }, HeaderManager.telemetryFlatten(finalRes.headers), { kind: 'function', event: 'viewer-response', runtime: 'cloudfront-function', functionIds: [mod.id] });
                });

                if (options.verbose && cffResLogs.length > 0) req._logBuffer.push(...cffResLogs);
            }

            // Final Response: body the viewer receives — same as last response body state (possibly mutated by L@E)
            this.broadcastStage('Final Response', { requestId, status: finalRes.status, uri: req.url, ...liveResBodyState }, HeaderManager.telemetryFlatten(finalRes.headers), { kind: 'final-response' });
            this._sendResponse(res, finalRes, requestId, startTime, req, options, body);

        } catch (err: any) {
            this.telemetry.broadcast({
                id: requestId,
                type: 'error',
                details: { message: err.message, stack: err.stack }
            });
            if (res.writableEnded) return;
            this._applyCors(res, options);

            if (err instanceof EdgeError) {
                // AWS Parity: 502 for function validation errors, 503 for execution errors
                const xmlEscape = (v: string) => v.replace(/[<>&'"]/g, c => `&#${c.charCodeAt(0)};`);
                res.statusCode = err.status;
                res.setHeader('Content-Type', 'application/xml');
                res.end(`<?xml version="1.0" encoding="UTF-8"?>
<Error>
    <Code>${err.code}</Code>
    <Message>${xmlEscape(err.message)}</Message>
    <RequestId>${requestId}</RequestId>
</Error>`);
                return;
            }

            res.statusCode = 502;
            res.end(`[Local Emulator] Bad Gateway: ${err.message}`);
        }
    }

    /**
     * AWS Parity ("Restrictions on the request body with the include body option"): a replaced body
     * is limited to 40 KB (viewer) / 1 MB (origin) as text, or 53.2 KB / 1.33 MB as base64.
     * Exceeding it is a 502 validation error.
     */
    private _checkReplacedBodySize(stage: 'viewer-request' | 'origin-request', body: { data: any; encoding?: string }, options: any): void {
        const isBase64 = body.encoding !== 'text';
        const limit = stage === 'viewer-request'
            ? (isBase64 ? AWS_LIMITS.VIEWER_REPLACED_BODY_BASE64_BYTES : AWS_LIMITS.VIEWER_REPLACED_BODY_TEXT_BYTES)
            : (isBase64 ? AWS_LIMITS.ORIGIN_REPLACED_BODY_BASE64_BYTES : AWS_LIMITS.ORIGIN_REPLACED_BODY_TEXT_BYTES);
        const size = Buffer.byteLength(String(body.data ?? ''));
        if (size <= limit) return;

        const msg = `Replaced request body too large: ${size} bytes exceeds the ${limit}-byte limit for ${stage} (${isBase64 ? 'base64' : 'text'})`;
        if (options.strict) throw EdgeError.validation('lambda', msg);
        console.warn(`\x1b[33m⚠️  [Fidelity Warning] ${msg}\x1b[0m`);
    }

    /**
     * AWS Parity ("Combining CloudFront Functions with Lambda@Edge"): CloudFront Functions and
     * Lambda@Edge can't both be associated with viewer events. AWS rejects this at deploy time.
     */
    private _checkViewerEventMixing(options: any, hooks: any[]): void {
        const active = hooks.filter((h: any) => !this.hookRegistry.hasDisabledHook(h.id));
        const isViewer = (h: any) => h.stage === 'viewer-request' || h.stage === 'viewer-response';
        const cff = active.filter((h: any) => isViewer(h) && h.type.toLowerCase().includes('function'));
        const lae = active.filter((h: any) => isViewer(h) && !h.type.toLowerCase().includes('function'));
        if (cff.length === 0 || lae.length === 0) return;

        const names = (hs: any[]) => hs.map(h => `${path.basename(h.path)} (${h.stage})`).join(', ');
        const msg = `CloudFront Functions and Lambda@Edge can't be combined in viewer events: ${names(cff)} + ${names(lae)}`;
        if (options.strict) throw new EdgeError(502, 'InvalidFunctionAssociation', msg);
        if (this.lastMixingWarning !== msg) {
            this.lastMixingWarning = msg;
            console.warn(`\x1b[33m⚠️  [Fidelity Warning] ${msg}\x1b[0m`);
        }
    }

    private lastMixingWarning: string | null = null;

    /**
     * The functions to run for one event of a behavior, split by runtime and minus disabled ones.
     * Project behaviors list their functions; 2.x behaviors (no `functions`) run every loaded hook.
     */
    private _stageFunctions(behavior: ResolvedBehavior | undefined, stage: HookType): { cff: string[]; lae: string[] } {
        const ids = behavior?.functions
            ? (behavior.functions[stage] || [])
            : [...(this.cffRunner?.getStageIds(stage) || []), ...(this.edgeRunner?.getStageIds(stage) || [])];
        const active = ids.filter(id => !this.hookRegistry.hasDisabledHook(id));
        return {
            cff: active.filter(id => this.cffRunner?.hasModule(id)),
            lae: active.filter(id => this.edgeRunner?.hasModule(id))
        };
    }

    /** Registry entries (including functions that failed to build) relevant to a behavior. */
    private _hooksFor(behavior: ResolvedBehavior | undefined): any[] {
        const all = this.hookRegistry.getAllHooks();
        if (!behavior?.functions) return all;
        const ids = new Set(Object.values(behavior.functions).flat());
        return all.filter((h: any) => ids.has(h.id));
    }

    private _fileNames(runner: EdgeRunner | CFFRunner | null, ids: string[]): string {
        return ids.map(id => path.basename(runner?.getModule(id)?.filePath || id)).join(' + ');
    }

    /** L@E request body replacement: `encoding` is 'base64' (default) or 'text'. */
    private _decodeRequestBody(body: { data: any; encoding?: string }): Buffer {
        return Buffer.from(String(body.data ?? ''), body.encoding === 'text' ? 'utf8' : 'base64');
    }

    /** --cors: added at the viewer boundary only, so hooks never see it; a hook-set value wins. */
    private _applyCors(res: any, options: any): void {
        if (options.cors && !res.hasHeader('access-control-allow-origin')) {
            res.setHeader('Access-Control-Allow-Origin', '*');
        }
    }

    private _broadcastDistribution(): void {
        // Keep all Forensic UI tabs in sync
        this.telemetry.broadcast({
            type: 'distribution',
            data: this.getDistribution()
        } as any);
    }

    /** Telemetry snapshot of the live request headers, preferring rawHeaders for wire casing. */
    private _headerSnapshot(req: any): Record<string, any> {
        // Fidelity Fix: Use rawHeaders for wire-casing, but FALLBACK to req.headers if empty to prevent UI {} bugs
        return HeaderManager.telemetryFlatten((req.rawHeaders && req.rawHeaders.length > 0)
            ? this.headerManager.parseIncomingHeaders(req.rawHeaders)
            : req.headers);
    }

    /**
     * Rolls a response hook's body replacement forward. Strict AWS: a replacement always
     * overwrites the origin body (no pass-through); no body on the result keeps the current one.
     */
    private _applyHookBody(result: any, current: Buffer): Buffer {
        if (result.body === undefined || result.body === null) return current;
        if (Buffer.isBuffer(result.body)) return result.body;

        let rb = result.body;
        let encoding = result.bodyEncoding || 'text';

        // Unpack Internal Body Object (Fidelity Plus Leak)
        if (typeof rb === 'object' && rb.data !== undefined) {
            encoding = rb.encoding || encoding;
            rb = rb.data;
        }

        const rawBody = (typeof rb === 'object' && rb !== null) ? JSON.stringify(rb) : String(rb);
        return encoding === 'base64' ? Buffer.from(rawBody, 'base64') : Buffer.from(rawBody);
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

        HeaderManager.applyToResponse(res, responseData);
        this._applyCors(res, options);

        const duration = Date.now() - startTime;
        const statusStr = res.statusCode >= 400 ? `\x1b[31m${res.statusCode}\x1b[0m` : `\x1b[32m${res.statusCode}\x1b[0m`;
        const logPrefix = `\x1b[90m[${requestId}]\x1b[0m`;

        if (options.verbose && req._logBuffer) {
            req._logBuffer.push(`${logPrefix} \x1b[90m╰─\x1b[0m [Response] Status: ${statusStr} [${duration}ms]`);

            // ATOMIC FLUSH: Print the entire contiguous story of the request in one go.
            console.log(req._logBuffer.join('\n') + '\n');
        } else if (!options.noBanner && options.requestLogging !== false) {
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

        // 3. Final Fidelity Resolution: Unpack/Serialize the body for transmission
        let finalBody = responseData.body || originalBody;
        if (finalBody !== undefined && finalBody !== null) {
            // Unpack Internal Body Object (Fidelity Plus Leak)
            if (typeof finalBody === 'object' && !Buffer.isBuffer(finalBody) && (finalBody as any).data !== undefined) {
                const encoding = (finalBody as any).encoding || 'text';
                const data = (finalBody as any).data;
                finalBody = encoding === 'base64' ? Buffer.from(String(data), 'base64') : Buffer.from(String(data));
            } else if (typeof finalBody === 'object' && !Buffer.isBuffer(finalBody)) {
                // Generic Object -> Stringify (Standard AWS Behavior)
                finalBody = JSON.stringify(finalBody);
            } else if (typeof finalBody === 'string' && responseData.bodyEncoding === 'base64') {
                // Generated responses may declare a base64 body (L@E `bodyEncoding`)
                finalBody = Buffer.from(finalBody, 'base64');
            }
        }

        res.end(finalBody);

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
    /**
     * Fidelity URL Sync: Reconstructs the internal req.url from a hook result's uri and querystring.
     * This ensures that query string mutations (like normalization or filtering) are preserved.
     */
    private _syncUrlToRequest(req: any, result: any): void {
        if (!result) return;

        // Prefer explicit 'url' if provided, otherwise use 'uri' (pathname) + 'querystring'
        const newUri = result.url || result.uri;
        const newQs = result.querystring;

        if (newUri !== undefined) {
            req.url = newUri + (newQs ? '?' + newQs : '');
        } else if (newQs !== undefined) {
            // Path didn't change, but query string did
            const [pathPart] = req.url.split('?');
            req.url = pathPart + (newQs ? '?' + newQs : '');
        }
    }
}
