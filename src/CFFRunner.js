'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const dotenv = require('dotenv');
const { CFF_LIMITS, CFF_RUNTIME } = require('./constants');
const { CFFValidator } = require('./CFFValidator');
const EventEmitter = require('events');

class CFFRunner extends EventEmitter {
    constructor(sourcePath, options = {}) {
        super();
        this.sourcePath = sourcePath ? path.resolve(sourcePath) : null;
        this.options = options;
        this.outputPath = options.outputPath;
        this.bakePath = options.bakePath;
        this.bakeVars = {};
        this.watchers = [];

        // 1. Initialize Validator with strictness from options
        this.validator = new CFFValidator({ strict: !!options.strict });

        // Initialize functions
        this.functions = {
            'viewer-request': [],
            'viewer-response': []
        };

        if (this.sourcePath) {
            this.loadFunctions();
        }

        // If watch enabled
        if (options.watch !== false) {
            this._watch();
        }
    }

    _loadBakeVars() {
        // 1. Clear the "Ghost" state immediately
        this.bakeVars = {};

        // 2. Only fill it if the file actually exists
        if (this.bakePath && fs.existsSync(this.bakePath)) {
            try {
                const raw = fs.readFileSync(this.bakePath, 'utf8');
                this.bakeVars = dotenv.parse(raw);

                if (this.options.debug) {
                    console.log(`🔐 [CFF] Bake variables synchronized.`);
                }
            } catch (err) {
                console.error(`🛑 [CFF] Failed to parse bake file: ${err.message}`);
            }
        } else if (this.bakePath) {
            // 3. Inform the user that the variables are now gone
            console.warn(`⚠️  [CFF] Bake file not found at ${this.bakePath}. All __PLACEHOLDERS__ will remain unreplaced.`);
        }
    }

    // Enable watch
    _watch() {
        if (!this.sourcePath) return;
        const targetPath = path.resolve(this.sourcePath);

        // 1. Initial check
        if (!fs.existsSync(targetPath)) return;

        const watcher = fs.watch(targetPath, { recursive: true }, (eventType, filename) => {
            // 2. THE CRITICAL FIX: If the directory was just deleted, Windows
            // will fire this event. If we don't return here, the next line
            // (loadFunctions) will crash the entire process.
            if (!fs.existsSync(targetPath)) return;

            const changedFile = filename || path.basename(targetPath);
            this.loadFunctions(changedFile);
        });

        // Handle internal errors so they don't crash Node
        watcher.on('error', (err) => {
            if (err.code === 'EPERM') return; // Ignore Windows delete-race errors
            console.error('Watcher error:', err);
        });

        this.watchers.push(watcher);
    }

    loadFunctions(changedFile) {
        if (changedFile) {
            console.log(`\x1b[36m🔄 [CFF] Hot-Reload triggered by: ${changedFile}\x1b[0m`);
        } else {
            console.log(`🚀 [CFF] Initializing functions from: ${this.sourcePath}`);
        }

        // ALWAYS refresh bake variables before reloading functions
        this._loadBakeVars();
        // Reset state before reloading
        this.functions = {
            'viewer-request': [],
            'viewer-response': []
        };

        if (!fs.existsSync(this.sourcePath)) {
            console.warn(`⚠️  [CFF] Path not found: ${this.sourcePath}`);
            return;
        }

        const stats = fs.statSync(this.sourcePath);
        if (stats.isFile()) {
            this.registerFile(this.sourcePath);
        } else if (stats.isDirectory()) {
            const files = fs.readdirSync(this.sourcePath).sort();
            files.forEach(file => {
                if (file.endsWith('.js')) {
                    this.registerFile(path.join(this.sourcePath, file));
                }
            });
        }
    }

    registerFile(filePath) {
        const filename = path.basename(filePath);
        let type = null;

        if (filename.startsWith('viewer-request')) type = 'viewer-request';
        else if (filename.startsWith('viewer-response')) type = 'viewer-response';

        if (!type) {
            console.warn(`⚠️  [CFF] Skipping file "${filename}": Must start with 'viewer-request' or 'viewer-response'.`);
            return;
        }

        // --- STEP 1: LOAD & BAKE ---
        let code = fs.readFileSync(filePath, 'utf8');
        code = code.replace(/__([A-Z0-9_.-]+)__/g, (m, key) => this.bakeVars[key] ?? m);

        // --- STEP 2: PRE-VALIDATION (FAIL-FAST) ---
        // Validate immediately after baking to ensure injected vars don't break ES 5.1
        const isValid = this.validator.validate(filename, code);
        if (!isValid) {
            this.compileError = `ES 5.1 Validation Error in ${filename}`;
            console.error(`   ⏳ Waiting for file changes to automatically retry...\n`);
            this.emit('build_error', { type: 'cff', file: filePath, error: this.compileError });
            return; 
        }

        try {
            new vm.Script(code, { filename: filePath });
            const wasError = !!this.compileError;
            this.compileError = null;
            if (wasError) {
                console.log(`\n\x1b[32m✅ [Build Recovered]\x1b[0m CloudFront Function compiled successfully!`);
                console.log(`   File: ${filePath}\n`);
            }
            this.emit('build_success', { type: 'cff', file: filePath });
        } catch (err) {
            this.compileError = err.stack || err.message;
            // Extract line number from the stack trace for a clear user-facing label
            const lineMatch = (err.stack || '').match(new RegExp(path.basename(filePath).replace('.', '\\.') + ':(\\d+)'));
            const lineInfo = lineMatch ? `\x1b[33mLine ${lineMatch[1]}\x1b[0m` : 'unknown line';
            const codeLines = code.split('\n');
            const lineNum = lineMatch ? parseInt(lineMatch[1], 10) : null;
            const snippet = lineNum ? `\n      ${codeLines[lineNum - 1]?.trim()}` : '';
            console.error(`\n🛑 [\x1b[31mBuild Error\x1b[0m] SyntaxError in CloudFront Function!`);
            console.error(`   File: ${path.basename(filePath)} at ${lineInfo}${snippet}`);
            console.error(`   ${err.message}\n`);
            console.error(`   ⏳ Waiting for file changes to automatically retry...\n`);
            this.emit('build_error', { type: 'cff', file: filePath, error: this.compileError });
            return;
        }

        
        // --- STEP 3: OUTPUT SAVING ---
        if (this.outputPath) {
            fs.mkdirSync(this.outputPath, { recursive: true });
            const outFilePath = path.join(this.outputPath, filename);
            fs.writeFileSync(outFilePath, code);
        }

        // --- STEP 4: RESOURCE CHECK ---
        if (code.length > CFF_LIMITS.MAX_CODE_SIZE_BYTES) {
            const msg = `[CFF] Code size (${(code.length / 1024).toFixed(1)}KB) exceeds 10KB limit.`;
            if (this.options.strict) {
                this.compileError = `Size Limit Exceeded: ${msg}`;
                console.error(`🛑 [\x1b[31mBuild Error\x1b[0m] ${msg}`);
                console.error(`   ⏳ Waiting for file changes to automatically retry...\n`);
                return;
            }
            console.warn(`⚠️  ${msg}`);
        }

        this.functions[type].push({
            name: filename,
            code: code,
            path: filePath
        });
    }

    async runChain(type, initialEvent) {
        let currentEvent = initialEvent;
        let totalCpuTimeMs = 0;

        for (const fn of this.functions[type]) {
            const { result, cpuTimeMs } = this.executeSync(fn, currentEvent);
            totalCpuTimeMs += cpuTimeMs;

            if (result) {
                if (result.method || result.uri) {
                    currentEvent.request = result;
                } else if (result.statusCode) {
                    currentEvent.response = result;
                } else if (result.request || result.response) {
                    currentEvent = result;
                }

                // If a viewer-request hook generated a response, CloudFront stops and returns it immediately
                if (type === 'viewer-request' && currentEvent.response) {
                    break;
                }
            }
        }

        if (currentEvent) {
            currentEvent.totalCpuTimeMs = totalCpuTimeMs;
        }
        return currentEvent;
    }

    executeSync(fn, event) {
        // --- STEP 1: ENVIRONMENT LOCKDOWN ---
        // Explicitly define allowed globals and block Node.js leaks
        const sandbox = {
            event: event,
            console: console, // Allow console.log from CFF for debugging if needed
            Math: Math,
            JSON: JSON,
            Object: Object,
            String: String,
            Array: Array,
            Number: Number,
            Date: Date,
            // Lockdown
            Buffer: undefined,
            process: undefined,
            require: undefined,
            module: undefined,
            exports: undefined
        };

        const context = vm.createContext(sandbox);

        // --- STEP 2: HANDLER WRAPPING ---
        // Wrap code to ensure we can call the handler
        const scriptCode = `
            ${fn.code}
            if (typeof handler !== 'function') {
                throw new Error('CFF must define a "handler" function.');
            }
            handler(event);
        `;

        const script = new vm.Script(scriptCode, {
            filename: fn.name,
            timeout: CFF_LIMITS.MAX_TOTAL_TIME_MS
        });

        const start = process.hrtime.bigint();
        try {
            const result = script.runInContext(context, {
                timeout: CFF_LIMITS.MAX_TOTAL_TIME_MS,
                breakOnSigint: true
            });
            const end = process.hrtime.bigint();
            const cpuTimeMs = Number(end - start) / 1e6;

            if (cpuTimeMs > CFF_LIMITS.MAX_CPU_TIME_MS) {
                console.warn(`⚠️  [CFF] ${fn.name} exceeded 1ms CPU limit (Used: ${cpuTimeMs.toFixed(2)}ms). AWS may throttle this function.`);
            }

            return { result, cpuTimeMs };
        } catch (err) {
            console.error(`🛑 [CFF] Execution Error in ${fn.name}: ${err.message}`);
            return { result: null, cpuTimeMs: 0 };
        }
    }

    // Bidirectional Mappers
    toCFFEvent(req, bodyBuffer, hookType, resData = null) {
        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

        const event = {
            version: '1.0',
            context: {
                eventType: hookType,
                requestId: req.requestID || 'local',
                distributionDomainName: 'localhost',
                distributionId: 'EDGETEST'
            },
            viewer: {
                ip: (req.socket && req.socket.remoteAddress) || '127.0.0.1'
            },
            request: {
                method: req.method,
                uri: url.pathname,
                headers: {},
                querystring: {},
                cookies: {}
            }
        };

        if (resData) {
            event.response = {
                statusCode: resData.status || 200,
                statusDescription: resData.statusDescription || 'OK',
                headers: {},
                cookies: {}
            };

            for (const [key, value] of Object.entries(resData.headers || {})) {
                const val = Array.isArray(value) ? value[0] : value;
                event.response.headers[key.toLowerCase()] = { value: String(val) };
            }
        }

        // --- RECONCILED HEADER MAPPING ---
        const reconciledHeaders = {};

        // 1. Parse rawHeaders (Actual Socket Data)
        if (req.rawHeaders) {
            for (let i = 0; i < req.rawHeaders.length; i += 2) {
                const originalKey = req.rawHeaders[i];
                const lowerKey = originalKey.toLowerCase();
                if (!reconciledHeaders[lowerKey]) reconciledHeaders[lowerKey] = [];
                reconciledHeaders[lowerKey].push({ key: originalKey, value: String(req.rawHeaders[i + 1]) });
            }
        }

        // 2. Merge with req.headers (Injected CLI --headers)
        // Only adds if the header is not already in the raw list (Curl overrides CLI)
        for (const [lowerKey, v] of Object.entries(req.headers || {})) {
            if (!reconciledHeaders[lowerKey]) {
                reconciledHeaders[lowerKey] = [{ key: lowerKey, value: String(v) }];
            }
        }

        // 3. Map to CFF Object Structure
        for (const [lowerKey, entries] of Object.entries(reconciledHeaders)) {
            if (entries.length === 1) {
                event.request.headers[lowerKey] = { value: entries[0].value };
            } else {
                event.request.headers[lowerKey] = {
                    value: entries[0].value,
                    multiValue: entries.map(e => ({ value: e.value }))
                };
            }
        }

        // Querystring mapping
        url.searchParams.forEach((value, key) => {
            event.request.querystring[key] = { value: value };
        });

        // Cookies mapping
        if (req.headers.cookie) {
            req.headers.cookie.split(';').forEach(c => {
                const [k, v] = c.trim().split('=');
                if (k) event.request.cookies[k] = { value: v || '' };
            });
        }

        return event;
    }

    fromCFFEvent(cffResponse) {
        if (!cffResponse) return null;

        let target = cffResponse;
        // If it's a full event object, we need to extract the request or response part
        if (cffResponse.request && !cffResponse.method && !cffResponse.statusCode) {
            // Priority 1: If it's a viewer-request hook that generated a response, return the response
            if (cffResponse.response && cffResponse.context && cffResponse.context.eventType === 'viewer-request') {
                target = cffResponse.response;
            }
            // Priority 2: If it's a viewer-response hook, return the response
            else if (cffResponse.response && cffResponse.context && cffResponse.context.eventType === 'viewer-response') {
                target = cffResponse.response;
            }
            // Priority 3: Otherwise return the request
            else {
                target = cffResponse.request;
            }
        }

        // If it's a request object (now or after extraction), translate back
        if (target.method || target.uri) {
            let url = target.uri;
            if (target.querystring) {
                const qs = Object.entries(target.querystring)
                    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v.value)}`)
                    .join('&');
                if (qs) url += '?' + qs;
            }
            const headers = {};
            if (target.headers) {
                for (const [k, v] of Object.entries(target.headers)) {
                    headers[k] = [{ key: k, value: v.value }];
                }
            }
            return {
                url: url,
                headers: headers,
                _isResponse: false
            };
        }

        // If it's a response object (now or after extraction)
        if (target.statusCode) {
            const headers = {};

            // 1. Existing Header Logic
            if (target.headers) {
                for (const [k, v] of Object.entries(target.headers)) {
                    headers[k.toLowerCase()] = [{ key: k, value: v.value }];
                }
            }

            // NEW: Fixed serialize the CFF cookie object into actual Set-Cookie headers
            if (target.cookies) {
                if (!headers['set-cookie']) headers['set-cookie'] = [];

                for (const [cookieName, cookieObj] of Object.entries(target.cookies)) {
                    let cookieStr = `${cookieName}=${cookieObj.value}`;
                    if (cookieObj.attributes) cookieStr += `; ${cookieObj.attributes}`;

                    headers['set-cookie'].push({ key: 'Set-Cookie', value: cookieStr });
                }
            }

            // Return
            return {
                status: target.statusCode,
                statusDescription: target.statusDescription || 'OK',
                headers: headers,
                body: target.body ? target.body.data : '',
                _isResponse: true
            };
        }

        return null;
    }

    close() {
        if (this.watchers) {
            this.watchers.forEach(w => w.close());
            this.watchers = [];
        }
    }
}

module.exports = { CFFRunner };
