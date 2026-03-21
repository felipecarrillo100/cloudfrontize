'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const dotenv = require('dotenv');

const { AWS_RUNTIME, AWS_HEADERS, AWS_LIMITS } = require('./constants');
const { AsyncLocalStorage } = require('async_hooks');
const EventEmitter = require('events');
const acorn = require('acorn');

class EdgeRunner extends EventEmitter {
    constructor(edgePath, options = {}) {
        super();
        this.edgePath = edgePath ? path.resolve(edgePath) : null;
        this.envPath = options.envPath;
        this.bakePath = options.bakePath;
        this.outputPath = options.outputPath;
        this.strict = options.strict || false;
        this.debug = options.debug || false;
        this.allowNetworking = options.allowNetworking || false;
        this.logPath = options.logPath;
        this.logContext = new AsyncLocalStorage();

        // Initialize log file (overwrite)
        if (this.logPath) {
            fs.mkdirSync(path.dirname(this.logPath), { recursive: true });
            fs.writeFileSync(this.logPath, '');
        }

        this.modules = {
            'viewer-request': [],
            'origin-request': [],
            'origin-response': [],
            'viewer-response': []
        };

        this.envVars = { ...AWS_RUNTIME.DEFAULT_ENV };
        this.bakeVars = {};
        this.watchers = [];
        this.whitelist = [...AWS_RUNTIME.ENV_WHITELIST];

        if (options.watch !== false) {
            this._watch();
        }

        // 🚀 Initial load (Ensure hooks are ready for tests/CLI)
        this.load();
    }

    /* =========================================================
       FIDELITY: LOAD & SANDBOX (Checklist Item 9)
    ========================================================= */

    load(changedFile) {
        // Hot reload: refresh env and bake if they changed or on INITIAL load
        if (!changedFile || changedFile === this.envPath) this._loadEnv(this.envPath);
        if (!changedFile || changedFile === this.bakePath) this._loadBake(this.bakePath);

        // Notify Hot reload to user
        if (changedFile && this.debug) {
            console.log(`\x1b[36m🔄 [EdgeRunner] Hot Reload triggered by: ${changedFile}\x1b[0m`);
        } else if (this.debug) {
            console.log(`\x1b[36m🚀 [EdgeRunner] Initializing edge modules...\x1b[0m`);
        }
 
        // CRITICAL: Refresh variables from disk BEFORE processing JS files
        this._loadFidelityFiles();
 
        // Reset module registry
        Object.keys(this.modules).forEach(k => this.modules[k] = []);
        if (!fs.existsSync(this.edgePath)) return;
 
        const stat = fs.statSync(this.edgePath);
        const files = stat.isDirectory()
            ? fs.readdirSync(this.edgePath).filter(f => f.endsWith('.js'))
            : [this.edgePath];

        files.forEach(f => {
            this._loadFile(stat.isDirectory() ? path.join(this.edgePath, f) : f);
        });
    }

    _detectHookType(sandbox, fileName) {
        const mod = sandbox.module.exports;
        
        // Priority 1: Explicit Code Marker (Actually set in code)
        if (mod.hookType) return mod.hookType;

        // Priority 2: Filename Prefix
        const prefixes = ['viewer-request', 'origin-request', 'viewer-response', 'origin-response'];
        for (const prefix of prefixes) {
            if (fileName.toLowerCase().startsWith(prefix)) {
                return prefix;
            }
        }

        // Priority 3: Global Fallback (Default)
        console.warn(`\x1b[33m⚠️  [Fidelity Warning] No hook type detected for ${fileName}. Defaulting to 'viewer-request'.\x1b[0m`);
        return 'viewer-request';
    }

    _loadFile(filePath) {
        let code = fs.readFileSync(filePath, 'utf8');
        code = code.replace(/__([A-Z0-9_.-]+)__/g, (m, key) => this.bakeVars[key] ?? m);

        if (this.outputPath) {
            const isSourceDir = fs.statSync(this.edgePath).isDirectory();

            // If the user specified a file path (has extension) AND source is not a dir, use it directly.
            // Otherwise (user specified a dir, or source is a dir containing multiple files), append the filename.
            const outFilePath = (isSourceDir || !path.extname(this.outputPath))
                ? path.join(this.outputPath, path.basename(filePath))
                : this.outputPath;

            fs.mkdirSync(path.dirname(outFilePath), { recursive: true });
            fs.writeFileSync(outFilePath, this._stripHookType(code));
        }

        const logger = (level, ...args) => {
            const ctx = this.logContext.getStore() || { requestId: 'INTERNAL', hookType: 'INIT' };
            const timestamp = new Date().toISOString();
            const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
            const formatted = `${timestamp}  [${ctx.requestId}] [${ctx.hookType}]  ${message}\n`;

            if (this.debug) {
                // Call global console so Jest spies work
                if (level === 'error') console.error(formatted.trim());
                else if (level === 'warn') console.warn(formatted.trim());
                else console.log(formatted.trim());
            }
            if (this.logPath) {
                fs.appendFileSync(this.logPath, formatted);
            }
        };

        const mockModule = { exports: {} };
        // Closure-bound dynamic whitelist (Pivots after detection)
        let allowed = AWS_RUNTIME.ALLOWED_ORIGIN; 

        const sandbox = {
            module: mockModule, exports: mockModule.exports,
            Buffer,
            console: {
                log: (...args) => logger('log', ...args),
                info: (...args) => logger('log', ...args),
                warn: (...args) => logger('warn', ...args),
                error: (...args) => logger('error', ...args),
            },
            setTimeout, clearTimeout, setInterval, clearInterval, setImmediate,
            URL, URLSearchParams, TextEncoder, TextDecoder,
            process: { env: { ...this.envVars }, nextTick: process.nextTick, version: process.version },
            require: (id) => {
                // 1. Check Global Forbidden List (Strict Bans)
                if (AWS_RUNTIME.FORBIDDEN_MODULES.includes(id)) {
                    throw new Error(`Forbidden: ${id} is restricted in the Lambda@Edge environment.`);
                }

                // 3. Track and validate later (Contextual Sandbox)
                if (!sandbox.__usedModules) sandbox.__usedModules = [];
                sandbox.__usedModules.push(id);

                // 4. Conditional Networking Whitelist
                const isNetAllowed = this.allowNetworking && AWS_RUNTIME.ALLOWED_NETWORKING.includes(id);

                // Check built-in and SDK whitelists
                const isAllowed = allowed.includes(id) ||
                                 isNetAllowed ||
                                 id.startsWith('node:') ||
                                 id.startsWith('@aws-sdk/client-');

                if (!id.startsWith('.') && !isAllowed) {
                    const isBannedNet = !this.allowNetworking && AWS_RUNTIME.ALLOWED_NETWORKING.includes(id);
                    if (isBannedNet) {
                        throw new Error(`Forbidden: '${id}' is restricted by default for security. Use the --allow-networking flag to enable it.`);
                    }
                    throw new Error(`Forbidden: ${id} is not available in Lambda@Edge context.`);
                }

                return id.startsWith('.') ? require(path.resolve(path.dirname(filePath), id)) : require(id);
            },
            __dirname: path.dirname(filePath),
            __filename: filePath
        };

        sandbox.global = sandbox;
        vm.createContext(sandbox);

        try {
            new vm.Script(code, { filename: filePath }).runInContext(sandbox);
            this.emit('build_success', { type: 'edge', file: filePath });
        } catch (err) {
            // ... (keep current error handling)
            this.compileError = err.stack || err.message;
            const lineMatch = (err.stack || '').match(new RegExp(path.basename(filePath).replace('.', '\\.') + ':(\\d+)'));
            const lineInfo = lineMatch ? `\x1b[33mLine ${lineMatch[1]}\x1b[0m` : 'unknown line';
            const codeLines = code.split('\n');
            const lineNum = lineMatch ? parseInt(lineMatch[1], 10) : null;
            const snippet = lineNum ? `\n      ${codeLines[lineNum - 1]?.trim()}` : '';

            this.emit('build_error', { type: 'edge', file: filePath, error: this.compileError });
            console.error(`\n🛑 [\x1b[31mBuild Error\x1b[0m] SyntaxError in Lambda@Edge script!`);
            console.error(`   File: ${path.basename(filePath)} at ${lineInfo}${snippet}`);
            console.error(`   ${err.message}\n`);
            console.error(`   ⏳ Waiting for file changes to automatically retry...\n`);
            return;
        }

        const hookType = this._detectHookType(sandbox, path.basename(filePath));

        // --- CONTEXTUAL SANDBOX ENFORCEMENT ---
        // Pivot the closure-bound whitelist for subsequent calls inside the handler
        if (hookType && hookType.startsWith('viewer-')) {
            allowed = AWS_RUNTIME.ALLOWED_VIEWER;
            // Retrospectively check if any restricted modules were used during top-level load
            const used = sandbox.__usedModules || [];
            for (const id of used) {
                if (!AWS_RUNTIME.ALLOWED_VIEWER.includes(id) && !id.startsWith('.')) {
                    const isBannedGlobal = AWS_RUNTIME.FORBIDDEN_MODULES.includes(id);
                    const msg = isBannedGlobal ? 
                        `Forbidden: ${id} is restricted in the Lambda@Edge environment.` :
                        `Forbidden: ${id} is not available in viewer-request scripts.`;
                    
                    this.compileError = msg; // Store for tests
                    console.error(`\n🛑 [\x1b[31mSandbox Error\x1b[0m] ${msg}`);
                    console.error(`   File: ${path.basename(filePath)}\n`);
                    return; // Graceful stop
                }
            }
        }

        if (mockModule.exports.handler && hookType) {
            const existing = this.modules[hookType][0];
            if (existing) {
                console.warn(`⚠️  [CloudFrontize] Warning: Multiple files found for "${hookType}". Keeping "${path.basename(existing.file)}" and ignoring "${path.basename(filePath)}".`);
                return;
            }
            this.modules[hookType].push({ handler: mockModule.exports.handler, file: filePath });
        }
    }

    /* =========================================================
       FIDELITY: REQUEST PIPELINE (Checklist Item 1, 4, 12)
    ========================================================= */

    async runRequestHook(req, bodyBuffer, requestID = 'UNKNOWN') {
        let request = this._buildRequestRecord(req, bodyBuffer);
        let totalDurationMs = 0;

        for (const type of ['viewer-request', 'origin-request']) {
            for (const mod of this.modules[type]) {
                const originalHeaders = this._deepClone(request.headers);

                // Invoke the Lambda handler within the log context
                const { result, durationMs } = await this.logContext.run({ requestId: requestID, hookType: type }, () =>
                    this._invoke(mod.handler, request, type)
                );

                totalDurationMs += durationMs;

                // STRICT FIDELITY: If the hook was aborted (timeout in strict mode), return a timeout marker
                if (result === null && this.strict) return { _timeout: true, totalDurationMs };
                if (!result) continue;

                // Short-circuit: Response returned instead of request mutation
                if (result.status && !result.uri) {
                    const finalResponse = this._flatten(result);
                    finalResponse._isResponse = true;
                    finalResponse.type = type;
                    finalResponse.totalDurationMs = totalDurationMs;
                    return finalResponse;
                }

                // Apply Mutations (The "Connective Tissue")
                if (result.uri !== undefined) request.uri = result.uri;
                if (result.querystring !== undefined) request.querystring = result.querystring;

                if (result.headers) {
                    const mutatedHeaders = this._normalizeHeadersInternal(result.headers);
                    // FIDELITY: Reconcile and warn in strict mode
                    this._reconcileHeaders(mutatedHeaders, originalHeaders, type);
                    request.headers = mutatedHeaders;
                }

                // Origin Persistence (Fixes Country/Geo routing failures)
                if (result.origin) {
                    request.origin = request.origin || {};
                    if (result.origin.custom) {
                        request.origin.custom = { ...(request.origin.custom || {}), ...result.origin.custom };
                    }
                    if (result.origin.s3) {
                        request.origin.s3 = { ...(request.origin.s3 || {}), ...result.origin.s3 };
                    }
                }
                request.type = type;
            }
        }

        const flattened = this._flatten(request);
        if (flattened) {
            flattened.totalDurationMs = totalDurationMs;
        }
        return flattened;
    }

    /* =========================================================
       FIDELITY: RESPONSE PIPELINE (Checklist Item 1)
    ========================================================= */
    async runResponseHook(req, resData, requestID = 'UNKNOWN') {
        const request = this._buildRequestRecord(req);
        let totalDurationMs = 0;
        let reconciledHeaders = this._normalizeHeadersInternal(resData.headers || {});
        
        // AWS Fidelity: Strip globally forbidden headers from the event object
        for (const h of AWS_HEADERS.FORBIDDEN) {
            delete reconciledHeaders[h];
        }

        // AWS Fidelity: Strip headers that are forbidden to be mutated in REQUEST hooks
        for (const h of AWS_HEADERS.REQUEST_ONLY_FORBIDDEN) {
            delete reconciledHeaders[h];
        }

        for (const type of ['viewer-response', 'origin-response']) {
            for (const mod of this.modules[type]) {
                const originalHeaders = this._deepClone(reconciledHeaders);

                // Invoke handler
                const { result, durationMs } = await this.logContext.run({ requestId: requestID, hookType: type }, () =>
                    this._invoke(mod.handler, { request, response: { status: resData.status, statusDescription: resData.statusDescription, headers: reconciledHeaders } }, type)
                );

                totalDurationMs += durationMs;

                if (result === null && this.strict) return { _timeout: true, totalDurationMs };
                if (!result) continue;

                if (result.status) resData.status = result.status;
                if (result.statusDescription) resData.statusDescription = result.statusDescription;
                if (result.headers) {
                    const mutatedHeaders = this._normalizeHeadersInternal(result.headers);
                    // FIDELITY: Reconcile and warn in strict mode
                    this._reconcileHeaders(mutatedHeaders, originalHeaders, type);
                    reconciledHeaders = mutatedHeaders;
                }
            }
        }

        const response = {
            status: String(resData.status || 200),
            statusDescription: resData.statusDescription || 'OK',
            headers: reconciledHeaders
        };

        const flattened = this._flatten(response);
        if (flattened) {
            flattened.totalDurationMs = totalDurationMs;
        }
        return flattened;
    }

    /* =========================================================
       FIDELITY: HELPERS (Checklist Item 2, 7, 10)
    ========================================================= */

    _invoke(handler, record, type) {
        return new Promise((resolve, reject) => {
            const isViewerHook = type.startsWith('viewer-');
            const limit = isViewerHook ? AWS_LIMITS.VIEWER_TIMEOUT_MS : AWS_LIMITS.ORIGIN_TIMEOUT_MS;
            const startTime = Date.now();

            const cloned = this._deepClone(record);
            const cf = type.includes('response') ? { request: cloned.request, response: cloned.response } : { request: cloned };
            const event = { Records: [{ cf }] };
            const context = {
                functionName: 'edgeRunner',
                getRemainingTimeInMillis: () => Math.max(0, limit - (Date.now() - startTime))
            };

            let timedOut = false;
            let resolved = false;
            const timer = setTimeout(() => {
                timedOut = true;
                const msg = `Lambda execution exceeded ${limit / 1000}s timeout limit.`;
                const ctx = this.logContext.getStore() || { requestId: 'UNKNOWN', hookType: type };
                const logMsg = `${new Date().toISOString()}  [${ctx.requestId}] [${ctx.hookType}]  [ERROR] ${msg}\n`;

                if (this.debug) process.stderr.write(logMsg);
                if (this.logPath) fs.appendFileSync(this.logPath, logMsg);

                if (this.strict) {
                    resolved = true;
                    resolve({ result: null, durationMs: Date.now() - startTime }); // Abort execution in strict mode
                }
            }, limit);

            try {
                const handleResult = (res) => {
                    if (resolved) return;

                    // FIDELITY CHECK: CloudFront returns 502 if the response is not an object.
                    if (res !== undefined && (res === null || typeof res !== 'object')) {
                        const msg = `[CloudFrontize] 502 Error: Lambda returned a ${typeof res} instead of an Object.`;

                        console.error(`\x1b[31m🛑 502 Bad Gateway:\x1b[0m ${msg}`);

                        resolved = true;
                        clearTimeout(timer);
                        // This REJECT is what stops the flow and prevents the browser from getting a 200
                        return reject(new Error(msg));
                    }

                    // In strict mode, if we already timed out, we MUST NOT resolve with the result.
                    // The timeout handler already resolved with null.
                    if (timedOut && this.strict) return;

                    resolved = true;
                    clearTimeout(timer);

                    const durationMs = Date.now() - startTime;
                    if (timedOut && !this.strict) {
                        const ctx = this.logContext.getStore() || { requestId: 'UNKNOWN', hookType: type };
                        console.warn(`⚠️  [${ctx.requestId}] [${ctx.hookType}] Fidelity Warning: Handler took ${(durationMs / 1000).toFixed(2)}s, exceeding the AWS ${limit / 1000}s limit.`);
                    }
                    resolve({ result: res, durationMs });
                };

                const result = handler(event, context, (err, res) => {
                    if (resolved) return;
                    if (err) {
                        resolved = true;
                        clearTimeout(timer);
                        reject(err);
                    } else {
                        handleResult(res);
                    }
                });

                if (result && typeof result.then === 'function') {
                    result.then(handleResult).catch(err => {
                        if (resolved) return;
                        resolved = true;
                        clearTimeout(timer);
                        reject(err);
                    });
                } else if (result !== undefined) {
                    handleResult(result);
                }
            } catch (e) {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timer);
                    reject(e);
                }
            }
        });
    }

    _buildRequestRecord(req, bodyBuffer) {
        const urlStr = req.url || '/';
        const urlObj = new URL(urlStr, 'http://localhost');

        const body = bodyBuffer ? {
            action: 'read',
            data: bodyBuffer.toString('base64'),
            encoding: 'base64',
            inputTruncated: false
        } : undefined;

        // QueryString Determinism (Sorting for Cache Keys)
        const params = [...urlObj.searchParams.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        const normalizedQs = new URLSearchParams(params).toString();

        const headers = this._normalizeHeadersInternal(req.headers || {});
        
        // AWS Fidelity: Strip globally forbidden headers from the event object
        for (const h of AWS_HEADERS.FORBIDDEN) {
            delete headers[h];
        }

        // AWS Fidelity: Strip headers that are forbidden to be mutated in REQUEST hooks
        for (const h of AWS_HEADERS.REQUEST_ONLY_FORBIDDEN) {
            delete headers[h];
        }

        return {
            method: req.method || 'GET',
            uri: urlObj.pathname,
            querystring: normalizedQs,
            headers: headers,
            body: body,
            clientIp: req.socket?.remoteAddress || '127.0.0.1'
        };
    }

    _parseIncomingHeaders(req) {
        const headers = {};

        // 1. Parse rawHeaders to preserve exact original casing and arrays
        if (req.rawHeaders) {
            for (let i = 0; i < req.rawHeaders.length; i += 2) {
                const originalKey = req.rawHeaders[i];
                const value = req.rawHeaders[i + 1];
                const lowerKey = originalKey.toLowerCase();

                if (!headers[lowerKey]) {
                    headers[lowerKey] = [];
                }
                headers[lowerKey].push({ key: originalKey, value: String(value) });
            }
        } else {
            // Fallback for mock requests in tests that don't pass rawHeaders
            for (const [k, v] of Object.entries(req.headers || {})) {
                const lowerKey = k.toLowerCase();
                if (Array.isArray(v)) {
                    // Could be pre-formed AWS arrays [{ key, value }] from unit tests, or plain strings
                    headers[lowerKey] = v.map(val => {
                        if (val && typeof val === 'object' && 'value' in val) {
                            // Already a proper AWS header object
                            return { key: val.key || k, value: String(val.value) };
                        }
                        return { key: k, value: String(val) };
                    });
                } else {
                    headers[lowerKey] = [{ key: k, value: String(v) }];
                }
            }
        }

        // 2. Reconcile with req.headers to catch any internal mutations
        // (like --default-headers or CFF mutations that happen before EdgeRunner)
        for (const [lowerKey, v] of Object.entries(req.headers || {})) {
            if (!headers[lowerKey]) {
                if (Array.isArray(v)) {
                    headers[lowerKey] = v.map(val => {
                        if (val && typeof val === 'object' && 'value' in val) {
                            return { key: val.key || lowerKey, value: String(val.value) };
                        }
                        return { key: lowerKey, value: String(val) };
                    });
                } else {
                    headers[lowerKey] = [{ key: lowerKey, value: String(v) }];
                }
            }
        }

        return headers;
    }

    _normalizeHeadersInternal(input) {
        const headers = {};
        for (const k in input) {
            const lowerKey = k.toLowerCase();
            const valueOpt = input[k];

            // AWS requires an array of objects: { key: 'Original-Case', value: 'val' }
            if (Array.isArray(valueOpt)) {
                headers[lowerKey] = valueOpt.map(v => {
                    // Case 1: already a proper AWS header object { key, value }
                    if (v && typeof v === 'object' && 'value' in v) {
                        return { key: v.key || k, value: String(v.value ?? '') };
                    }
                    // Case 2: plain string in array
                    return { key: k, value: String(v ?? '') };
                });
            } else if (typeof valueOpt === 'object' && valueOpt !== null) {
                headers[lowerKey] = [{ key: valueOpt.key || k, value: String(valueOpt.value ?? '') }];
            } else {
                headers[lowerKey] = [{ key: k, value: String(valueOpt ?? '') }];
            }
        }
        return headers;
    }

    _flatten(obj) {
        if (!obj) return obj;
        // Shallow copy for output to prevent mutation of internal state
        const out = { ...obj };

        if (obj.headers) {
            Object.keys(obj.headers).forEach(k => {
                const headersArray = obj.headers[k];
                if (Array.isArray(headersArray) && headersArray.length > 0) {
                    // CFF uses a flat key/value object, but Edge uses arrays. This flattening is mostly for internal proxy logic.
                    // We only take the first parameter for flatten as its mostly used for URLs matching.
                    const v = headersArray[0]?.value;
                    if (v !== undefined) out[k.toLowerCase()] = v;
                }
            });
        }
        if (out.uri) {
            out.url = out.querystring ? `${out.uri}?${out.querystring}` : out.uri;
        }
        return out;
    }

    _deepClone(obj) {
        try { return JSON.parse(JSON.stringify(obj)); } catch (e) { return { ...obj }; }
    }

    _loadEnv(envPath) {
        if (!envPath || !fs.existsSync(envPath)) return;
        const config = dotenv.parse(fs.readFileSync(envPath));
        const { RESTRICTED_AWS_ENV } = require('./constants');
        
        for (const k in config) {
            if (RESTRICTED_AWS_ENV.includes(k)) {
                throw new Error(`Restricted Variable: "${k}" cannot be used in .env file (AWS Managed)`);
            }
            this.envVars[k] = config[k];
        }
    }

    _loadBake(bakePath) {
        if (!bakePath || !fs.existsSync(bakePath)) return;
        const config = dotenv.parse(fs.readFileSync(bakePath));
        for (const k in config) {
            this.bakeVars[k] = config[k];
        }
    }

    /* Update _loadFidelityFiles to clear old state (prevents "ghost" vars) */
    _loadFidelityFiles() {
        // Reset to defaults so deleted vars actually disappear
        this.envVars = { ...AWS_RUNTIME.DEFAULT_ENV };
        this.bakeVars = {};

        if (this.envPath && fs.existsSync(this.envPath)) {
            try {
                const raw = dotenv.parse(fs.readFileSync(this.envPath));
                for (const [k, v] of Object.entries(raw)) {
                    if (!this.whitelist.includes(k)) throw new Error(`Restricted Variable: "${k}"`);
                    this.envVars[k] = v;
                }
            } catch (err) {
                console.error(`🛑 [EdgeRunner] Env Load Error: ${err.message}`);
                throw err; // <--- THIS IS THE MISSING PIECE, allowed so the test pass
            }
        }

        if (this.bakePath && fs.existsSync(this.bakePath)) {
            try {
                this.bakeVars = dotenv.parse(fs.readFileSync(this.bakePath));
            } catch (err) {
                console.error(`🛑 [EdgeRunner] Bake Load Error: ${err.message}`);
            }
        }
    }

    _watch() {
        [this.edgePath, this.envPath, this.bakePath].filter(Boolean).forEach(t => {
            if (fs.existsSync(t)) {
                const w = fs.watch(t, (eventType, filename) => {
                    // Windows Safety: If the path is being deleted, abort the reload
                    if (!fs.existsSync(t)) return;
                    this._load(filename);
                });
                this.watchers.push(w);
            }
        });
    }

    close() {
        this.watchers.forEach(w => w.close());
        this.watchers = [];
    }

    /**
     * Surgical AST-based removal of Cloudfrontize-specific 'exports.hookType'
     * This ensures production output is clean AWS code.
     */
    _stripHookType(code) {
        try {
            const ast = acorn.parse(code, { ecmaVersion: 2022, sourceType: 'script' });
            const toRemove = [];

            // Walk top-level nodes only (exports.hookType is always a top-level assignment)
            for (const node of ast.body) {
                if (node.type === 'ExpressionStatement' && 
                    node.expression.type === 'AssignmentExpression') {
                    
                    const left = node.expression.left;
                    // Check if: exports.hookType = ...
                    if (left.type === 'MemberExpression' &&
                        left.object.name === 'exports' &&
                        left.property.name === 'hookType') {
                        toRemove.push({ start: node.start, end: node.end });
                    }
                }
            }

            // Remove from right-to-left to keep offsets valid
            let cleanCode = code;
            for (const range of toRemove.reverse()) {
                const before = cleanCode.slice(0, range.start);
                const after = cleanCode.slice(range.end);
                cleanCode = before + after;
            }

            // Clean up potentially leftover empty lines
            return cleanCode.replace(/^\s*[\r\n]/gm, '').trim() + '\n';
            
        } catch (err) {
            console.warn(`\x1b[33m⚠️  [Fidelity Warning] AST Stripper failed: ${err.message}. Output might contain internal markers.\x1b[0m`);
            return code;
        }
    }

    _reconcileHeaders(mutatedHeaders, originalHeaders, hookType) {
        if (!this.strict) return;

        // Internal helper for forbidden check
        const check = (headers, type) => {
            const keys = Object.keys(headers).map(k => k.toLowerCase());
            for (const h of AWS_HEADERS.FORBIDDEN) {
                if (keys.includes(h)) return h;
            }
            if (type.includes('request')) {
                for (const h of AWS_HEADERS.REQUEST_ONLY_FORBIDDEN) {
                    if (keys.includes(h)) return h;
                }
            }
            return null;
        };

        const forbidden = check(mutatedHeaders, hookType);
        if (forbidden) {
            console.warn(`⚠️  [Fidelity Warning] (L@E ${hookType}) Forbidden header mutation: "${forbidden}" is restricted by AWS.`);
        }
    }
}

module.exports = { EdgeRunner };
