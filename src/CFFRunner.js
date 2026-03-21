'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const dotenv = require('dotenv');
const { CFF_LIMITS, CFF_RUNTIME, AWS_HEADERS } = require('./constants');
const { CFFValidator } = require('./CFFValidator');
const EventEmitter = require('events');
const acorn = require('acorn');

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

        // This is done twice. No need to do this in constructor (To review)
        if (this.sourcePath) {
            // 🚀 Initial load (Ensure hooks are ready for tests/CLI)
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

        if (!fs.existsSync(targetPath)) return;

        let lastReload = 0; // Cooldown Tracker
        const watcher = fs.watch(targetPath, { recursive: true }, (eventType, filename) => {
            if (!fs.existsSync(targetPath)) return;

            // Debounce: prevent multiple reloads for a single save (150ms window)
            const now = Date.now();
            if (now - lastReload < 150) return;
            lastReload = now;

            const changedFile = filename || path.basename(targetPath);
            this.loadFunctions(changedFile);
        });

        watcher.on('error', (err) => {
            if (err.code === 'EPERM') return; // Ignore Windows delete-race errors
            console.error('Watcher error:', err);
        });

        this.watchers.push(watcher);
    }

    loadFunctions(changedFile) {
        if (changedFile && this.options.debug) {
            console.log(`\x1b[36m🔄 [CFF] Hot-Reload triggered by: ${changedFile}\x1b[0m`);
        } else if (this.options.debug) {
            console.log(`🚀 [CFF] Initializing functions from: ${this.sourcePath}`);
        }

        // ALWAYS refresh bake variables before reloading functions
        this._loadBakeVars();

        // SURGICAL FIX: Use a staging area to prevent "Registry-Wipe" 502s
        const stagedFunctions = {
            'viewer-request': [],
            'viewer-response': []
        };

        if (!fs.existsSync(this.sourcePath)) {
            console.warn(`⚠️  [CFF] Path not found: ${this.sourcePath}`);
            return;
        }

        const stats = fs.statSync(this.sourcePath);
        if (stats.isFile()) {
            this.registerFile(this.sourcePath, stagedFunctions);
        } else if (stats.isDirectory()) {
            const files = fs.readdirSync(this.sourcePath).sort();
            files.forEach(file => {
                if (file.endsWith('.js')) {
                    this.registerFile(path.join(this.sourcePath, file), stagedFunctions);
                }
            });
        }

        // ATOMIC SWAP: Only update live state if new handlers were successfully registered
        const totalFound = Object.values(stagedFunctions).flat().length;
        if (totalFound > 0) {
            this.functions = stagedFunctions;
            if (changedFile && this.options.debug) {
                console.log(`\x1b[32m✅ [CFF] Hot-Reload Success: ${totalFound} handlers active.\x1b[0m`);
            }
        } else if (changedFile) {
            console.error(`\x1b[31m🛑 [CFF] Hot-Reload Failed: Keeping previous valid version active.\x1b[0m`);
        }
    }

    registerFile(filePath, registry = this.functions) {
        const filename = path.basename(filePath);
        let type = null;

        if (filename.startsWith('viewer-request')) type = 'viewer-request';
        else if (filename.startsWith('viewer-response')) type = 'viewer-response';

        if (!type) {
            console.warn(`⚠️  [CFF] Skipping file "${filename}": Must start with 'viewer-request' or 'viewer-response'.`);
            return;
        }

        try {
            // --- STEP 1: LOAD & BAKE ---
            // Ensure content is loaded into a local variable to prevent undefined .replace() errors
            let fileCode = fs.readFileSync(filePath, 'utf8');
            fileCode = fileCode.replace(/__([A-Z0-9_.-]+)__/g, (m, key) => this.bakeVars[key] ?? m);

            // --- STEP 2: PRE-VALIDATION (FAIL-FAST) ---
            const { valid, violations } = this.validator.validate(filename, fileCode);
            const codeLines = fileCode.split('\n');

            for (const v of violations) {
                const lineInfo = v.lineNum ? `\x1b[33mLine ${v.lineNum}\x1b[0m` : null;
                const snippet = v.lineNum ? `\n      ${codeLines[v.lineNum - 1]?.trim()}` : '';
                const location = lineInfo ? ` at ${lineInfo}${snippet}` : '';

                if (v.level === 'error') {
                    console.error(`\n🛑 [\x1b[31mBuild Error\x1b[0m] CloudFront Functions requires ES 5.1!`);
                    console.error(`   File: ${filename}${location}`);
                    console.error(`   ${v.message}`);
                    if (v.hint) console.error(`   💡 Hint: ${v.hint}`);
                } else {
                    const lineLabel = v.lineNum ? ` (Line ${v.lineNum})` : '';
                    console.warn(`\n⚠️  [CFF] Policy Warning in ${filename}${lineLabel}`);
                    console.warn(`   ${v.message}`);
                }
            }

            if (!valid) {
                this.compileError = violations.filter(v => v.level === 'error').map(v => v.message).join('\n');
                this.emit('build_error', { type: 'cff', file: filePath, error: this.compileError });
                return;
            }

            // --- STEP 3: VM SYNTAX CHECK ---
            try {
                new vm.Script(fileCode, { filename: filePath });
                this.compileError = null;
                this.emit('build_success', { type: 'cff', file: filePath });
            } catch (err) {
                this.compileError = err.stack || err.message;
                const lineMatch = (err.stack || '').match(new RegExp(path.basename(filePath).replace('.', '\\.') + ':(\\d+)'));
                const lineInfo = lineMatch ? `\x1b[33mLine ${lineMatch[1]}\x1b[0m` : 'unknown line';
                const lineNum = lineMatch ? parseInt(lineMatch[1], 10) : null;
                const snippet = lineNum ? `\n      ${codeLines[lineNum - 1]?.trim()}` : '';

                console.error(`\n🛑 [\x1b[31mBuild Error\x1b[0m] SyntaxError in CloudFront Function!`);
                console.error(`   File: ${path.basename(filePath)} at ${lineInfo}${snippet}`);
                console.error(`   ${err.message}\n`);
                this.emit('build_error', { type: 'cff', file: filePath, error: this.compileError });
                return;
            }

            // --- STEP 4: OUTPUT SAVING ---
            if (this.outputPath) {
                fs.mkdirSync(this.outputPath, { recursive: true });
                const outFilePath = path.join(this.outputPath, filename);
                fs.writeFileSync(outFilePath, this._stripHookType(fileCode));
            }

            // --- STEP 5: RESOURCE CHECK ---
            if (fileCode.length > CFF_LIMITS.MAX_CODE_SIZE_BYTES) {
                const sizeKb = (fileCode.length / 1024).toFixed(1);
                const msg = `Code size (${sizeKb}KB) exceeds the AWS 10KB limit for CloudFront Functions.`;
                if (this.options.strict) {
                    console.error(`\n🛑 [\x1b[31mBuild Error\x1b[0m] CloudFront Functions size limit exceeded! File: ${filename}`);
                    return;
                }
                console.warn(`⚠️  [CFF] ${msg}`);
            }

            // --- STEP 6: PUSH TO STAGING REGISTRY ---
            registry[type].push({
                name: filename,
                code: fileCode,
                path: filePath
            });

        } catch (err) {
            console.error(`🛑 [CFF] Unexpected Error loading ${filename}: ${err.message}`);
        }
    }

    async runChain(hookType, event) {
        let currentEvent = event;
        let totalCpuTimeMs = 0;

        for (const fn of this.functions[hookType]) {
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
                if (hookType === 'viewer-request' && currentEvent.response) {
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
            const cpuTimeMs = Number(end - start) / 1e6; // Original calculation
            // const cpuTimeMs = (end[0] * 1000 + end[1] / 1000000); // Proposed change, but inconsistent with bigint

            if (cpuTimeMs > CFF_LIMITS.MAX_CPU_TIME_MS) {
                // Call global console so Jest spies work
                console.warn(`⚠️  [CFF] ${fn.name} exceeded 1ms CPU limit (Used: ${cpuTimeMs.toFixed(2)}ms). AWS may throttle this function.`);
            }

            return { result, cpuTimeMs };
        } catch (err) {
            console.error(`🛑 [CFF] Execution Error in ${fn.name}: ${err.message}`);

            // If we are in strict mode, we MUST fail the request
            if (this.options.strict) {
                throw new Error(`CFF Execution Error: ${err.message}`);
            }

            // Relaxed mode: keep the current "silent failure" behavior
            return { result: null, cpuTimeMs: 0 };
        }
    }

    // Bidirectional Mappers
    toCFFEvent(req, bodyBuffer, hookType, resData = null) {
        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const incomingHeaders = this._parseIncomingHeaders(req);

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
        const reconciledHeaders = incomingHeaders;

        // AWS Fidelity: Strip globally forbidden headers from the CFF event
        for (const h of AWS_HEADERS.FORBIDDEN) {
            delete reconciledHeaders[h];
        }

        // AWS Fidelity: Strip headers that are forbidden to be mutated in REQUEST hooks
        if (hookType === 'viewer-request') {
            for (const h of AWS_HEADERS.REQUEST_ONLY_FORBIDDEN) {
                delete reconciledHeaders[h];
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

    _parseIncomingHeaders(req) {
        const headers = {};

        // 1. Initial population from req.headers (reliable fallback)
        for (const [k, v] of Object.entries(req.headers || {})) {
            const lowerKey = k.toLowerCase();
            if (Array.isArray(v)) {
                headers[lowerKey] = v.map(val => ({ key: k, value: String(val) }));
            } else {
                headers[lowerKey] = [{ key: k, value: String(v) }];
            }
        }

        // 2. Overwrite/supplement with rawHeaders to preserve exact casing if available
        if (req.rawHeaders) {
            // Reset for raw headers to ensure we use the EXACT casing from the socket where possible
            const rawParsed = {};
            for (let i = 0; i < req.rawHeaders.length; i += 2) {
                const originalKey = req.rawHeaders[i];
                const value = req.rawHeaders[i + 1];
                const lowerKey = originalKey.toLowerCase();
                if (!rawParsed[lowerKey]) rawParsed[lowerKey] = [];
                rawParsed[lowerKey].push({ key: originalKey, value: String(value) });
            }
            // Merge rawParsed into headers (Raw socket data takes precedence for fidelity)
            for (const [lowerKey, entries] of Object.entries(rawParsed)) {
                headers[lowerKey] = entries;
            }
        }

        return headers;
    }

    fromCFFEvent(cffResponse) {
        if (!cffResponse) return null;

        let target = cffResponse;
        // If it's a full event object, we need to extract the request or response part
        if (cffResponse.request && !cffResponse.method && !cffResponse.statusCode) {
            // Priority 1: If it's a viewer-request hook that generated a response, return the response
            if (cffResponse.response) {
                target = cffResponse.response;
            }
            // Priority 2: Otherwise return the request
            else {
                target = cffResponse.request;
            }
        }

        // --- PRECEDENCE FIX: Check for RESPONSE first ---
        if (target.statusCode || target.status) {
            const headers = {};
            if (target.headers) {
                for (const [k, v] of Object.entries(target.headers)) {
                    headers[k.toLowerCase()] = [{ key: k, value: v.value }];
                }
            }
            if (target.cookies) {
                if (!headers['set-cookie']) headers['set-cookie'] = [];
                for (const [cookieName, cookieObj] of Object.entries(target.cookies)) {
                    let cookieStr = `${cookieName}=${cookieObj.value}`;
                    if (cookieObj.attributes) cookieStr += `; ${cookieObj.attributes}`;
                    headers['set-cookie'].push({ key: 'Set-Cookie', value: cookieStr });
                }
            }
            return {
                status: target.statusCode || target.status,
                statusDescription: target.statusDescription || 'OK',
                headers: headers,
                body: target.body ? target.body.data : '',
                _isResponse: true
            };
        }

        // --- Fallback: Check for REQUEST mutation ---
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
                    headers[k.toLowerCase()] = [{ key: k, value: v.value }];
                }
            }
            return {
                url: url,
                headers: headers,
                _isResponse: false
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

    /**
     * Surgical AST-based removal of Cloudfrontize-specific 'exports.hookType'
     * This ensures production output is clean AWS code.
     */
    _stripHookType(code) {
        try {
            const ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'script' });
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
            // CFF might be ES 5.1, so we use latest parser but fall back if it fails
            return code;
        }
    }
}

module.exports = { CFFRunner };
