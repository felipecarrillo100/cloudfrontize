'use strict';

const http = require('http');
const handler = require('serve-handler');
const compression = require('compression');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { AWS_LIMITS } = require('./constants');
const { HeaderParser } = require('./headerParser');
const EventEmitter = require('events');
const pkg = require('../package.json');
 
 
function printTopBanner(options) {
    if (options.noRequestLogging) return;
    console.log(`\n☁️  \x1b[1mCloudfrontize v${pkg.version}\x1b[0m\n`);
    console.log(`  ➜ Local:   \x1b[36mhttp://localhost:${options.port}/\x1b[0m`);
    if (options.webui) {
        console.log(`  ➜ WebUI:   \x1b[36mhttp://localhost:${parseInt(options.webui)}/\x1b[0m`);
    }
    const modeName = options.mode === 'rest' ? 'REST (Strict Fidelity)' : 'Website (S3 Website Hosting)';
    console.log(`  ➜ Mode:    ${modeName}\n`);
}

function printBottomBanner(options) {
    const { edgeRunner, cffRunner } = options;

    if (!options.noRequestLogging) {
        if (edgeRunner || cffRunner) {
            console.log(`  ⚙️  Active Environment`);
            if (edgeRunner) {
                Object.entries(edgeRunner.modules).forEach(([hook, mods]) => {
                    if (mods.length > 0) {
                        const filename = path.basename(mods[0].file);
                        console.log(`     - \x1b[35m${hook}\x1b[0m: ${filename}`);
                    }
                });
            }
            if (cffRunner) {
                Object.entries(cffRunner.functions).forEach(([hook, fns]) => {
                    fns.forEach(fn => {
                        console.log(`     - \x1b[35m${hook}\x1b[0m: ${fn.name} (VM)`);
                    });
                });
            }
            const netLabel = options.allowNetworking ? '\x1b[33mEnabled\x1b[0m' : '\x1b[32mDisabled\x1b[0m';
            const strictLabel = options.strict ? '\x1b[31mEnabled\x1b[0m' : '\x1b[32mDisabled\x1b[0m';
            console.log(`     - Networking:    ${netLabel}`);
            console.log(`     - Strict Limits: ${strictLabel}\n`);
        }
    }

    // --- ALWAYS Flush any initial build errors after the banner (UX) ---
    // NO LONGER NEEDED: Runners are explicitly loaded by the CLI after the banner
}

function startServer(options) {
    const { edgeRunner, cffRunner, headersPath } = options;

    // --- RE-INITIALIZE STATE ON EACH START ---
    const localHistory = new Map();
    const localOverrides = { request: {}, response: {} };
    const localEvents = new EventEmitter();

    // Relay Build Events from Runners to the WebUI
    const relayBuildEvent = (eventName) => (payload) => localEvents.emit(eventName, payload);
    if (edgeRunner) {
        edgeRunner.on('build_error', relayBuildEvent('build_error'));
        edgeRunner.on('build_success', relayBuildEvent('build_success'));
    }
    if (cffRunner) {
        cffRunner.on('build_error', relayBuildEvent('build_error'));
        cffRunner.on('build_success', relayBuildEvent('build_success'));
    }

    // --- NEW: Parse headers into separate buckets ---
    const parser = new HeaderParser();
    const { requestHeaders, responseHeaders } = parser.parse(headersPath);
    // Merge with options.defaultHeaders (likely used in your automated tests)
    const finalRequestHeaders = { ...requestHeaders, ...(options.defaultHeaders || {}) };

    // Initialize header overrides from the file defaults if available
    localOverrides.request = { ...finalRequestHeaders };
    localOverrides.response = { ...responseHeaders };

    const compressMiddleware = compression({
        filter: (req, res) => {
            if (res.getHeader('Content-Encoding')) return false;
            return compression.filter(req, res);
        }
    });

    const server = http.createServer(async (req, res) => {
        const acceptEncoding = req.headers['accept-encoding'] || '';
        const requestID = crypto.randomBytes(4).toString('hex');

        // === 0. BODY BUFFERING ===
        let bodyBuffer = null;
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            bodyBuffer = await new Promise((resolve, reject) => {
                const chunks = [];
                req.on('data', chunk => chunks.push(chunk));
                req.on('end', () => resolve(Buffer.concat(chunks)));
                req.on('error', reject);
            });
        }

        // Telemetry Data (Initialized after bodyBuffer)
        const telemetry = {
            id: requestID,
            method: req.method,
            path: req.url,
            steps: [{ uri: req.url, label: 'Viewer Request' }],
            status: 200,
            cpu: 0,
            violation: null,
            headers: {
                request: { viewer: { ...req.headers }, origin: {} },
                response: { origin: {}, viewer: {} }
            },
            bodySnippet: bodyBuffer ? bodyBuffer.toString('utf8', 0, 1024) : null
        };

        let broadcasted = false;

        const broadcast = () => {
            if (broadcasted) return;
            broadcasted = true;

            telemetry.headers.response.viewer = res.getHeaders();
            telemetry.status = res.statusCode;

            localHistory.set(requestID, { ...telemetry, timestamp: new Date().toISOString() });

            if (localHistory.size > 50) {
                const firstKey = localHistory.keys().next().value;
                localHistory.delete(firstKey);
            }

            setImmediate(() => localEvents.emit('log', telemetry));
        };

        res.on('finish', broadcast);

        // === 0. HEADER INJECTION (Dual Context) ===

        // A. Inject Request Headers (Simulating the Browser/Viewer)
        const activeReqHeaders = { ...finalRequestHeaders, ...localOverrides.request };
        for (const [key, value] of Object.entries(activeReqHeaders)) {
            const lowerKey = key.toLowerCase();
            if (value === null) {
                // Explicit Suppression (Deletion)
                delete req.headers[lowerKey];
            } else if (req.headers[lowerKey] === undefined || localOverrides.request[key] !== undefined) {
                // Inject if missing OR explicitly overridden in UI
                req.headers[lowerKey] = value;
            }
        }

        // B. Inject Response Headers (Simulating the Origin)
        const activeResHeaders = { ...responseHeaders, ...localOverrides.response };
        for (const [key, value] of Object.entries(activeResHeaders)) {
            if (value === null) {
                res.removeHeader(key);
            } else {
                res.setHeader(key, value);
            }
        }

        // Bridge: Capture "Origin Request" state (After overrides, before hooks)
        // We will update this again after viewer-request hooks if they run.
        telemetry.headers.request.origin = { ...req.headers };

        // === 1. REQUEST HOOKS ===

        // --- 0. Global Compile-Time Safeguards ---
        if (edgeRunner && edgeRunner.compileError) {
            res.writeHead(502, { 'Content-Type': 'text/plain' });
            res.end(`502 Bad Gateway\n\nCloudFront could not connect to the origin or the Lambda@Edge function returned an invalid response.`);
            telemetry.status = 502;
            telemetry.violation = 'Lambda@Edge Compile Error';
            broadcast();
            return;
        }
 
        if (cffRunner && cffRunner.compileError) {
            res.writeHead(502, { 'Content-Type': 'text/plain' });
            res.end(`502 Bad Gateway\n\nCloudFront could not connect to the origin or the CloudFront Function returned an invalid response.`);
            telemetry.status = 502;
            telemetry.violation = 'CFF Compile Error';
            broadcast();
            return;
        }

        // --- 1a. CloudFront Functions (viewer-request) ---
        if (cffRunner) {
            try {
                const cffEvent = cffRunner.toCFFEvent(req, bodyBuffer, 'viewer-request');
                const cffResult = await cffRunner.runChain('viewer-request', cffEvent);
                const totalCpuTimeMs = cffResult?.totalCpuTimeMs || 0;
                telemetry.cpu += totalCpuTimeMs;
                const mappedResult = cffRunner.fromCFFEvent(cffResult);

                if (mappedResult) {
                    if (mappedResult._isResponse) {
                        const status = parseInt(mappedResult.status) || 200;
                        if (mappedResult.headers) {
                            for (const [k, values] of Object.entries(mappedResult.headers)) {
                                if (values && values.length > 0) {
                                    const headerVals = values.map(v => v.value);
                                    res.setHeader(k, headerVals.length === 1 ? headerVals[0] : headerVals);
                                }
                            }
                        }
                        res.writeHead(status);
                        res.end(mappedResult.body || '');
                        telemetry.status = status;
                        broadcast();
                        return;
                    }

                    if (mappedResult.url) {
                        req.url = mappedResult.url;
                        telemetry.steps.push({ uri: req.url, label: '[CFF] viewer-request rewrite' });
                    }
                    if (mappedResult.headers) {
                        for (const [k, values] of Object.entries(mappedResult.headers)) {
                            if (values && values.length > 0) {
                                // Sync values to req.headers for downstream L@E access
                                // This is for THE ORIGIN request, not the response back to user.
                                const lowerKey = k.toLowerCase();
                                req.headers[lowerKey] = values.map(v => v.value).join(', ');
                            }
                        }
                    }
                }
                // Capture mutations after CFF viewer-request
                telemetry.headers.request.origin = { ...req.headers };
            } catch (err) {
                console.error(`🛑 [CFF] viewer-request crash: ${err.message}`);
                telemetry.violation = `CFF Execution Error: ${err.stack || err.message}`;
                res.writeHead(502, { 'Content-Type': 'text/plain' });
                res.end('502 Bad Gateway (CloudFront Functions Execution Error)');
                telemetry.status = 502;
                broadcast();
                return;
            }
        }

        // --- 1b. Lambda@Edge (viewer-request, origin-request) ---
        if (edgeRunner) {
            // Body Limit Check (Fidelity)
            if (bodyBuffer && bodyBuffer.length > AWS_LIMITS.VIEWER_REQUEST_BODY_BYTES) {
                const msg = `[CloudFrontize] Body exceeds 40KB limit (Current: ${(bodyBuffer.length / 1024).toFixed(1)}KB)`;
                if (options.strict) {
                    console.error(`🛑 ${msg} - AWS would reject this request via viewer-request.`);
                    res.writeHead(502, { 'Content-Type': 'text/plain' });
                    res.end('Bad Gateway (Body too large for viewer-request)');
                    telemetry.status = 502;
                    telemetry.violation = 'Body too large for viewer-request';
                    broadcast();
                    return;
                }
                console.warn(`⚠️  ${msg}. This is allowed locally but AWS will reject it.`);
            }

            try {
                const hookResult = await edgeRunner.runRequestHook(req, bodyBuffer, requestID);
                const totalDurationMs = hookResult?.totalDurationMs || 0;
                telemetry.cpu += totalDurationMs;

                if (hookResult?._timeout && options.strict) {
                    console.error('🛑 Strict Mode Violation: Lambda execution timed out and was aborted.');
                    telemetry.violation = 'Lambda Execution Timeout';
                    res.writeHead(502, { 'Content-Type': 'text/plain' });
                    res.end('Bad Gateway (Lambda Execution Timeout)');
                    telemetry.status = 502;
                    broadcast();
                    return;
                }

                if (hookResult) {
                    if (hookResult._isResponse) {
                        const body = hookResult.body || '';
                        const bodySize = Buffer.byteLength(body);

                        if (bodySize > AWS_LIMITS.GENERATED_RESPONSE_BODY_BYTES) {
                            const msg = `[CloudFrontize] Generated response exceeds 1MB limit (Current: ${(bodySize / (1024 * 1024)).toFixed(2)}MB)`;
                            if (options.strict) {
                                console.error(`🛑 ${msg} - AWS would reject this response.`);
                                telemetry.violation = 'Generated response too large (>1MB)';
                                res.writeHead(502, { 'Content-Type': 'text/plain' });
                                res.end('Bad Gateway (Generated response too large)');
                                telemetry.status = 502;
                                broadcast();
                                return;
                            }
                            telemetry.violation = 'Fidelity Warning: Generated response too large (>1MB)';
                            console.warn(`⚠️  ${msg}. This is allowed locally but AWS will reject it.`);
                        }

                        const status = parseInt(hookResult.status) || 200;
                        if (hookResult.headers) {
                            for (const [k, values] of Object.entries(hookResult.headers)) {
                                if (values && values.length > 0) {
                                    const headerVals = values.map(v => v.value);
                                    res.setHeader(k, headerVals.length === 1 ? headerVals[0] : headerVals);
                                }
                            }
                        }
                        res.writeHead(status);
                        res.end(body);
                        telemetry.status = status;
                        broadcast();
                        return;
                    }

                    // === FIDELITY: REWRITE HANDLING ===
                    if (hookResult.url) {
                        telemetry.steps.push({ uri: hookResult.url, label: 'L@E viewer/origin-request' });
                        const potentialPath = path.join(options.directory, decodeURIComponent(hookResult.url.split('?')[0]));
                        const exists = fs.existsSync(potentialPath);

                        if (exists) {
                            req.url = hookResult.url;
                            // Set compression headers for pre-compressed assets
                            if (req.url.endsWith('.br') && acceptEncoding.includes('br')) {
                                res.setHeader('Content-Encoding', 'br');
                            } else if (req.url.endsWith('.gz') && acceptEncoding.includes('gzip')) {
                                res.setHeader('Content-Encoding', 'gzip');
                            }
                        } else {
                            // Target does not exist.
                            if (options.strict) {
                                // In strict mode, we apply the rewrite anyway. serve-handler will then 404.
                                // This matches AWS behavior where a missing rewrite target results in a 404.
                                req.url = hookResult.url;
                                telemetry.steps.push({ uri: req.url, label: 'L@E rewrite (applied)' });
                            } else {
                                // Default mode: Safety fallback to the original file to prevent local 404s.
                                // But we MUST warn the user that this is non-fidelity behavior.
                                telemetry.violation = 'Fidelity Warning: Rewrite target not found';
                                console.warn(`⚠️  [CloudFrontize] Lambda rewritten URI to "${hookResult.url}" but file was not found at "${potentialPath}".`);
                                console.warn(`   Falling back to original file. (Note: AWS Lambda@Edge would return a 404 for this request).`);
                            }
                        }
                    }

                    // Sync custom headers (Mobile/Geo/Security) to the REQUEST
                    if (hookResult.headers) {
                        for (const [k, values] of Object.entries(hookResult.headers)) {
                            if (values && values.length > 0) {
                                const lowerKey = k.toLowerCase();
                                req.headers[lowerKey] = values.map(v => v.value).join(', ');
                            }
                        }
                    }
                }
            } catch (err) {
                if (options.strict && err.message.includes('Forbidden:')) {
                    console.error(`🛑 Strict Mode Violation: ${err.message}`);
                    telemetry.violation = err.message;
                    res.writeHead(502, { 'Content-Type': 'text/plain' });
                    res.end('Bad Gateway (Forbidden Header Mutation)');
                    telemetry.status = 502;
                    broadcast();
                    return;
                }
                console.error(`🛑 [Lambda@Edge] Request Hook Crash: ${err.message}`);
                telemetry.violation = `Lambda Execution Error: ${err.stack || err.message}`;
                res.writeHead(502, { 'Content-Type': 'text/plain' });
                res.end('502 Bad Gateway (Lambda Execution Error)');
                telemetry.status = 502;
                broadcast();
                return;
            }
        }

        // === 2. RESPONSE HOOK INTERCEPTION ===
        if (edgeRunner) {
            const urlPath = decodeURIComponent(req.url.split('?')[0]);
            const fullPath = path.join(options.directory, urlPath);
            let initialStatus = 200;

            // Simulate status for Range/Partial Content for the hook to analyze
            if (req.headers.range) initialStatus = 206;
            if (!fs.existsSync(fullPath)) initialStatus = 404;

            // Capture "Origin Response" state (after static serve or redirect, before hooks)
            telemetry.headers.response.origin = res.getHeaders();

            try {
                const hookResponse = await edgeRunner.runResponseHook(req, {
                    status: initialStatus,
                    headers: res.getHeaders()
                }, requestID);
                const totalDurationMs = hookResponse?.totalDurationMs || 0;
                telemetry.cpu += totalDurationMs;

                if (hookResponse?._timeout && options.strict) {
                    console.error('🛑 Strict Mode Violation: Lambda execution timed out and was aborted.');
                    telemetry.violation = 'Lambda Execution Timeout (Response)';
                    res.writeHead(502, { 'Content-Type': 'text/plain' });
                    res.end('Bad Gateway (Lambda Execution Timeout)');
                    telemetry.status = 502;
                    broadcast();
                    return;
                }

                if (hookResponse && hookResponse.headers) {
                    // 1. Get current headers on the response object
                    const currentHeaders = res.getHeaderNames();

                    // 2. Identify headers to remove (those present in res but missing in Lambda result)
                    // We only do this for headers the Lambda is actually allowed to touch
                    for (const name of currentHeaders) {
                        const lowerName = name.toLowerCase();
                        if (!hookResponse.headers[lowerName]) {
                            res.removeHeader(name);
                        }
                    }

                    // 3. Apply/Update the headers returned by the Lambda
                    for (const [k, values] of Object.entries(hookResponse.headers)) {
                        if (values && values.length > 0) {
                            const headerVals = values.map(v => v.value);
                            res.setHeader(k, headerVals.length === 1 ? headerVals[0] : headerVals);
                        }
                    }
                }
            } catch (err) {
                if (options.strict && err.message.includes('Forbidden:')) {
                    console.error(`🛑 Strict Mode Violation (Response): ${err.message}`);
                    telemetry.violation = err.message;
                    res.writeHead(502, { 'Content-Type': 'text/plain' });
                    res.end('Bad Gateway (Forbidden Response Header Mutation)');
                    telemetry.status = 502;
                    broadcast();
                    return;
                }
                console.error(`🛑 [Lambda@Edge] Response Hook Crash: ${err.message}`);
                telemetry.violation = `Lambda Execution Error: ${err.stack || err.message}`;
                res.getHeaderNames().forEach(h => res.removeHeader(h));
                res.writeHead(502, { 'Content-Type': 'text/plain' });
                res.end('502 Bad Gateway (Lambda Execution Error)');
                telemetry.status = 502;
                broadcast();
                return;
            }
        }

        // --- 2b. CloudFront Functions (viewer-response) ---
        if (cffRunner) {
            try {
                // Determine current status for the CFF event
                const urlPath = decodeURIComponent(req.url.split('?')[0]);
                const fullPath = path.join(options.directory, urlPath);
                let initialStatus = res.statusCode || 200;
                if (!res.statusCode && !fs.existsSync(fullPath)) initialStatus = 404;

                const cffEvent = cffRunner.toCFFEvent(req, bodyBuffer, 'viewer-response', {
                    status: initialStatus,
                    headers: res.getHeaders()
                });

                const cffResult = await cffRunner.runChain('viewer-response', cffEvent);
                const totalCpuTimeMs = cffResult?.totalCpuTimeMs || 0;
                telemetry.cpu += totalCpuTimeMs;
                const mappedResult = cffRunner.fromCFFEvent(cffResult);

                if (mappedResult && mappedResult.headers) {
                    for (const [k, values] of Object.entries(mappedResult.headers)) {
                        if (values && values.length > 0) {
                            const headerVals = values.map(v => v.value);
                            res.setHeader(k, headerVals.length === 1 ? headerVals[0] : headerVals);
                        }
                    }
                }

                if (mappedResult && mappedResult.status) {
                    res.statusCode = parseInt(mappedResult.status);
                }
            } catch (err) {
                console.error(`🛑 [CFF] viewer-response crash: ${err.message}`);
                telemetry.violation = `CFF Execution Error: ${err.stack || err.message}`;
                res.getHeaderNames().forEach(h => res.removeHeader(h));
                res.writeHead(502, { 'Content-Type': 'text/plain' });
                res.end('502 Bad Gateway (CloudFront Functions Execution Error)');
                telemetry.status = 502;
                broadcast();
                return;
            }
        }

        // Finalize "Origin Request" state if not already set (safety)
        if (!telemetry.headers.request.origin || Object.keys(telemetry.headers.request.origin).length === 0) {
            telemetry.headers.request.origin = { ...req.headers };
        }

        // === 3. STATIC FILE SERVING ===
        const urlPath = decodeURIComponent(req.url.split('?')[0]);
        const fullPath = path.join(options.directory, urlPath);

        // --- WEBSITE MODE DIRECTORY INDEX SUPPORT ---
        // S3 Website behavior: /folder/ -> /folder/index.html
        if (options.mode === 'website') {
            try {
                if (fs.existsSync(fullPath) && fs.lstatSync(fullPath).isDirectory()) {
                    const indexPath = path.join(fullPath, 'index.html');

                    if (fs.existsSync(indexPath)) {
                        const query = req.url.includes('?') ? '?' + req.url.split('?')[1] : '';
                        const newUrl = path.posix.join(urlPath, 'index.html');

                        if (options.debug) {
                            console.log(`[Debug] Website mode directory rewrite: ${req.url} -> ${newUrl}`);
                        }

                        req.url = newUrl + query;
                        telemetry.steps.push({ uri: req.url, label: 'Website mode index rewrite' });
                    }
                }
            } catch (err) {
                // Ignore stat errors, let serve-handler handle 404s
            }
        }

        // --- FIDELITY ENFORCEMENT (--mode rest) ---
        const isRestMode = options.mode === 'rest';
        if (options.debug) console.log(`[Debug] Mode: ${options.mode}, isRestMode: ${isRestMode}, URL: ${req.url}, FullPath: ${fullPath}`);

        if (isRestMode && urlPath !== '/') {
            try {
                if (fs.existsSync(fullPath) && fs.lstatSync(fullPath).isDirectory()) {
                    if (options.debug) console.log(`[Debug] Triggering 403 for directory: ${fullPath}`);
                    telemetry.violation = 'Directory indexing forbidden in rest mode';
                    res.writeHead(403, { 'Content-Type': 'text/plain' });
                    res.end('403 Forbidden - Directory indexing is disabled in --mode rest. Use a Lambda@Edge origin-request hook to append index.html to the URI.');
                    telemetry.status = 403;
                    broadcast();
                    return;
                }
            } catch (err) {
                // Ignore stat errors, let serve-handler handle 404s
            }
        }

        // FIDELITY: S3 Static Website Hosting returns 405 Method Not Allowed for non-GET/HEAD
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            const msg = `🛑 [Fidelity] 405 Method Not Allowed: S3 Static Website Hosting rejects ${req.method} requests.`;
            console.error(`\x1b[33m${msg}\x1b[0m`);
            res.setHeader('Allow', 'GET, HEAD');
            res.writeHead(405, { 'Content-Type': 'text/plain' });
            res.end(`405 Method Not Allowed (S3 Static Website Hosting requires GET or HEAD)`);
            telemetry.status = 405;
            broadcast();
            return;
        }

        const runHandler = () => handler(req, res, {
            public: options.directory,
            // cleanUrls is intentionally DISABLED in all modes.
            // S3 (both Website Hosting and REST/OAC) never strips .html extensions or does
            // clean-URL redirects. Enabling it creates infinite redirect loops when a
            // Lambda@Edge hook rewrites a path to '/index.html'.
            cleanUrls: false,
            directoryListing: options.mode !== 'rest', // In rest mode, no auto directory listing UI
            rewrites: [
                { source: '/', destination: '/index.html' },
                ...(options.single ? [{ source: '**', destination: '/index.html' }] : [])
            ],
            etag: !options.noEtag,
            headers: options.cors ? [{ source: '**/*', headers: [{ key: 'Access-Control-Allow-Origin', value: '*' }] }] : []
        });

        let shouldCompress = !options.noCompression;

        if (shouldCompress && fs.existsSync(fullPath) && fs.lstatSync(fullPath).isFile()) {
            const stats = fs.statSync(fullPath);
            // Skip compression for large files (CloudFront Fidelity)
            if (stats.size > AWS_LIMITS.COMPRESSION_BYPASS_BYTES) shouldCompress = false;
        }

        if (shouldCompress) {
            compressMiddleware(req, res, () => {
                runHandler();
            });
        } else {
            runHandler();
            // serve-handler might be async, but we can't easily await it here without changing its call.
            // For telemetry, we hook into res.end in a more robust way if needed,
            // but for now, we'll assume the standard flow.
            res.on('finish', () => {
                telemetry.status = res.statusCode;
                broadcast();
            });
        }
    });

    const sockets = new Set();
    server.on('connection', (socket) => {
        sockets.add(socket);
        socket.once('close', () => sockets.delete(socket));
    });

    // --- NEW: Optional Control Plane (Web UI) ---
    let uiServer = null;
    if (options.webui) {
        const uiPort = parseInt(options.webui);
        uiServer = http.createServer(async (req, res) => {
            // Management API
            if (req.url === '/events') {
                res.writeHead(200, {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive'
                });
                const initData = JSON.stringify({
                    type: 'init',
                    port: options.port,
                    version: pkg.version,
                    headerState: localOverrides
                });
                res.write(`data: ${initData}\n\n`);
                const onLog = (data) => res.write(`data: ${JSON.stringify({ type: 'request', request: data })}\n\n`);
                const onBuildError = (data) => res.write(`data: ${JSON.stringify({ type: 'build_error', payload: data })}\n\n`);
                const onBuildSuccess = (data) => res.write(`data: ${JSON.stringify({ type: 'build_success', payload: data })}\n\n`);

                localEvents.on('log', onLog);
                localEvents.on('build_error', onBuildError);
                localEvents.on('build_success', onBuildSuccess);

                req.on('close', () => {
                    localEvents.removeListener('log', onLog);
                    localEvents.removeListener('build_error', onBuildError);
                    localEvents.removeListener('build_success', onBuildSuccess);
                });
                return;
            }

            if (req.url.startsWith('/request/')) {
                const id = req.url.split('/').pop();
                const detail = localHistory.get(id);
                if (!detail) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ error: 'Not found' }));
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify(detail));
            }

            if (req.url === '/headers' && req.method === 'POST') {
                const body = await new Promise(resolve => {
                    let b = '';
                    req.on('data', c => b += c);
                    req.on('end', () => resolve(b));
                });
                try {
                    const data = JSON.parse(body);
                    localOverrides.request = data.request || {};
                    localOverrides.response = data.response || {};
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ status: 'ok' }));
                } catch (e) {
                    res.writeHead(400).end('Invalid JSON');
                }
                return;
            }

            // Static UI Housing (at /)
            const cleanPath = req.url.split('?')[0];
            const assetName = cleanPath === '/' ? 'index.html' : cleanPath.slice(1);
            const uiAssetPath = path.join(__dirname, 'ui', assetName);

            if (fs.existsSync(uiAssetPath) && fs.lstatSync(uiAssetPath).isFile()) {
                const ext = path.extname(uiAssetPath);
                const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
                res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
                fs.createReadStream(uiAssetPath).pipe(res);
            } else {
                res.writeHead(404).end('Not Found');
            }
        });

        uiServer.on('error', (e) => {
            if (e.code === 'EADDRINUSE') {
                console.error(`\n🛑 Port Conflict Error\n\n   The WebUI port ${uiPort} is already in use by another process.\n   \n   Action: \n   - Try running Cloudfrontize WebUI on a different port:  \`--webui <new-port>\`\n   - Or, stop the service currently running on port ${uiPort}.\n`);
                if (process.env.NODE_ENV !== 'test') {
                    process.exit(1);
                } else {
                    throw e;
                }
            } else {
                throw e;
            }
        });

        uiServer.listen(uiPort, () => {
            // Banner printing is consolidated at the end
        });
    }

    server.closeGracefully = function () {
        return new Promise(resolve => {
            if (edgeRunner) edgeRunner.close();
            if (cffRunner) cffRunner.close();
            if (uiServer) uiServer.close();
            for (const socket of sockets) socket.destroy();
            server.close(() => resolve());
        });
    };

    server.on('error', (e) => {
        if (e.code === 'EADDRINUSE') {
            const dir = options.directory ? ` ${options.directory}` : '';
            console.error(`\n🛑 Port Conflict Error\n\n   The local port ${options.port} is already in use by another process.\n   \n   Action: \n   - Try running Cloudfrontize on a different port:  \`cloudfrontize${dir} --port <new-port>\`\n   - Or, stop the service currently running on port ${options.port}.\n`);
            if (process.env.NODE_ENV !== 'test') {
                process.exit(1);
            } else {
                throw e;
            }
        } else {
            throw e;
        }
    });

    if (!options.noRequestLogging) {
        localEvents.on('log', (telemetry) => {
            const method = telemetry.method;
            const orig = telemetry.steps[0].uri;
            const final = telemetry.steps[telemetry.steps.length - 1].uri;
            const rewriteStr = orig !== final ? ` ➔ ${final}` : '';
            const status = telemetry.status;
            const timeMs = (telemetry.cpu || telemetry.cpu === 0) ? `  (${telemetry.cpu.toFixed(0)}ms)` : '';

            let statusColor = '\x1b[32m'; // green 200s
            if (status >= 300) statusColor = '\x1b[36m'; // cyan 300s
            if (status >= 400) statusColor = '\x1b[33m'; // yellow 400s
            if (status >= 500) statusColor = '\x1b[31m'; // red 500s

            console.log(`\x1b[36m[${method}]\x1b[0m \x1b[2m${orig}\x1b[0m${rewriteStr}  ${statusColor}[${status}]\x1b[0m${timeMs}`);
        });
    }

    return server.listen(options.port, () => {
        if (!options.noBanner) {
            printTopBanner(options);
            printBottomBanner(options);
        }
    });
}
 
module.exports = { startServer, printTopBanner, printBottomBanner };
