import fs from 'fs';
import http from 'http';
import path from 'path';
import { Telemetry } from './pipeline/Telemetry';
import { InMemoryHistoryStore } from './pipeline/HistoryStore';
import { Orchestrator } from './pipeline/Orchestrator';
import { LocalProvider, S3Provider, OriginProvider } from './pipeline/Providers';
import { WebUI } from './pipeline/WebUI';
import { EdgeRunner } from './core/EdgeRunner';
import { CFFRunner } from './core/CFFRunner';
import { AWS_HEADERS, AWS_LIMITS } from './constants';
import { HeaderParser } from './headerParser';
import { ConfigLoader } from './pipeline/ConfigLoader';

/**
 * The main entry point for the CloudFrontize emulator.
 * 
 * @namespace Backend
 * This file contains the primary server lifecycle logic, CLI banner printing, 
 * and orchestrator initialization. It handles the parsing of origins, 
 * runners, and telemetry systems.
 */

export { EdgeRunner, CFFRunner, AWS_HEADERS, AWS_LIMITS, HeaderParser };

export function printTopBanner(options: any) {
    console.log(`\n☁️  \x1b[1mCloudfrontize v1.10.2\x1b[0m\n`);
    console.log(`  ➜ Local:   \x1b[36mhttp://localhost:${options.port}/\x1b[0m`);
    if (options.webui) {
        console.log(`  ➜ WebUI:   \x1b[36mhttp://localhost:${options.webui}/\x1b[0m`);
    }
    console.log(`  ➜ Mode:    ${options.mode || 'rest'}`);
    const activeFlags = [
        options.debug   && '--debug',
        options.strict  && '--strict',
        options.single  && '--single',
        options.cors    && '--cors',
    ].filter(Boolean);
    if (activeFlags.length) {
        console.log(`  ➜ Flags:   \x1b[33m${activeFlags.join(' ')}\x1b[0m`);
    }
    console.log('');
}

export function printBottomBanner(options: any) {
    const { edgeRunner, cffRunner } = options;
    const hasActiveEdge = edgeRunner && edgeRunner.hasLoadedModules();
    const hasActiveCff = cffRunner && cffRunner.hasLoadedModules();

    if (!hasActiveEdge && !hasActiveCff) return;

    console.log(`  ⚙️  Active Environment`);
    if (hasActiveEdge) {
        const p = edgeRunner.getRunnerPath();
        console.log(`     - \x1b[35mLambda@Edge\x1b[0m: ${p ? path.basename(p) : 'Active'}`);
    }
    if (hasActiveCff) {
        const p = cffRunner.getRunnerPath();
        console.log(`     - \x1b[35mCloudFront Function\x1b[0m: ${p ? path.basename(p) : 'Active'}`);
    }
    console.log('');
}

export function startServer(options: any) {
    // Normalize: --debug (CLI flag) is the canonical name; verbose is the internal alias.
    // This ensures request logging works regardless of which property name is used.
    options.verbose = options.debug || options.verbose;

    const historyStore = new InMemoryHistoryStore(5000);
    const telemetry = new Telemetry(historyStore);

    // Forensic Visibility: Initialize a shared log stream if requested
    let logStream: any = null;
    if (options.log) {
        try {
            const logPath = path.resolve(options.log);
            const logDir = path.dirname(logPath);
            if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
            logStream = fs.createWriteStream(logPath, { flags: 'w' });
        } catch (err: any) {
            console.warn(`\x1b[33m⚠️  [Forensic] Failed to initialize log stream: ${err.message}\x1b[0m`);
        }
    }
    
    // Multi-Origin Configuration
    const config = options.origins 
        ? ConfigLoader.load(options.origins) 
        : ConfigLoader.fromCLI(options, options.directory);

    const commonOptions = { ...options, logStream };

    const edgeRunner = options.edgeRunner || (options.edge ? new EdgeRunner(options.edge, commonOptions) : null);
    const cffRunner = options.cffRunner || (options.cff ? new CFFRunner(options.cff, commonOptions) : null);
    
    options.edgeRunner = edgeRunner;
    options.cffRunner = cffRunner;
    options.logStream = logStream;

    const providers: Record<string, OriginProvider> = {};
    for (const o of config.origins) {
        if (o.type === 's3') {
            providers[o.id] = new S3Provider(o as any);
        } else {
            providers[o.id] = new LocalProvider(o.directory || options.directory || './www');
        }
    }

    const orchestrator = new Orchestrator(
        options.edgeRunner,
        options.cffRunner,
        providers,
        config.behaviors,
        telemetry,
        config,
        logStream
    );

    // Header parsing is deferred to after listen() so the readiness signal
    // ('Loading headers from: ...') only fires once the server is ready to accept connections.
    let headerConfigParsed = false;
    const applyHeaderConfig = () => {
        if (headerConfigParsed) return;
        headerConfigParsed = true;
        if (options.headers) {
            const headerParser = new HeaderParser();
            const headerConfig = headerParser.parse(path.resolve(options.headers));
            orchestrator.setStickyHeaders(headerConfig);
        } else if (options.defaultHeaders) {
            orchestrator.setStickyHeaders({ requestHeaders: options.defaultHeaders }, true);
        }
    };

    const webui = options.webui ? new WebUI(telemetry, orchestrator, options) : null;

    const compress = require('compression')({
        threshold: 0,
        filter: (req: any, res: any) => {
            const length = Number(res.getHeader('Content-Length'));
            if (length && length > AWS_LIMITS.COMPRESSION_BYPASS_BYTES) return false;
            return require('compression').filter(req, res);
        }
    });

    const mainServer = http.createServer((req: any, res: any) => {
        // Drain body FIRST (before compression middleware touches the stream)
        const drainAndHandle = async () => {
            // URL Normalization: Strip protocol/host if browser sends an absolute URL (common in Chrome for localhost)
            if (req.url.startsWith('http://') || req.url.startsWith('https://')) {
                try {
                    const urlObj = new URL(req.url);
                    req.url = urlObj.pathname + (urlObj.search || '');
                } catch (e) {
                    // Fallback: manual strip if URL is mangled
                    req.url = '/' + req.url.split('://')[1].split('/').slice(1).join('/');
                }
            }
            // Ensure path starts with /
            if (!req.url.startsWith('/')) req.url = '/' + req.url;

            let reqBody: Buffer | undefined;
            const hasBody = req.method !== 'GET' && req.method !== 'HEAD';

            if (hasBody) {
                try {
                    const chunks: any[] = [];
                    for await (const chunk of req) chunks.push(chunk);
                    reqBody = Buffer.concat(chunks);
                } catch (err: any) {
                    console.error(`\x1b[31m[CloudFrontize] Body Read error: ${err.message}\x1b[0m`);
                    if (!res.writableEnded) { res.statusCode = 400; res.end('Bad Request'); }
                    return;
                }
            }

            const handle = () => {
                orchestrator.handleRequest(req, res, options, reqBody).catch((err: any) => {
                    console.error(`\x1b[31m[CloudFrontize] Internal Error: ${err.message}\x1b[0m`);
                    if (!res.writableEnded) { res.statusCode = 500; res.end('Internal Server Error'); }
                });
            };

            // Only apply compression for GET/HEAD requests (static file serving).
            // Body requests (POST etc.) go through edge hooks and must not go through compression
            // to avoid ECONNRESET when undici starts reading the response while still uploading.
            if (!options.noCompression && !hasBody) {
                compress(req, res, handle);
            } else {
                handle();
            }
        };

        drainAndHandle();
    }) as any;

    // Track open connections so we can forcefully close them during graceful shutdown
    const openSockets = new Set<any>();
    mainServer.on('connection', (socket: any) => {
        openSockets.add(socket);
        socket.on('close', () => openSockets.delete(socket));
    });

    mainServer.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`\n\x1b[31m🛑 [Error] Port ${options.port} is already in use.\x1b[0m`);
            console.error(`   Please use '--port <number>' to specify a different port.\n`);
            process.exit(1);
        } else {
            console.error(`\n\x1b[31m🛑 [Error] Server failed to start: ${err.message}\x1b[0m\n`);
            process.exit(1);
        }
    });

    mainServer.listen(options.port, () => {
        applyHeaderConfig();
        if (!options.noBanner) {
            printTopBanner(options);
            printBottomBanner(options);
        }
        if (options.debug) console.log(`\n\x1b[32m✔  [Ready] CloudFrontize is serving traffic on port ${options.port}\x1b[0m\n`);
    });

    // Disable keep-alive to isolate connections per request (critical for test stability
    // and prevents AggregateError from stale pooled connections in Node.js 18+ undici/http)
    mainServer.keepAliveTimeout = 0;

    let uiServer: http.Server | null = null;
    if (webui) {
        uiServer = http.createServer((req, res) => {
            webui.handleRequest(req, res);
        });
        
        uiServer.on('error', (err: any) => {
            if (err.code === 'EADDRINUSE') {
                console.error(`\n\x1b[31m🛑 [Error] WebUI Port ${options.webui} is already in use.\x1b[0m`);
                console.error(`   Please use '--webui <number>' to specify a different port.\n`);
                process.exit(1);
            } else {
                console.error(`\n\x1b[31m🛑 [Error] WebUI Server failed to start: ${err.message}\x1b[0m\n`);
                process.exit(1);
            }
        });

        uiServer.listen(parseInt(options.webui));
    }

    mainServer.closeGracefully = async () => {
        if (options.edgeRunner) options.edgeRunner.close();
        if (options.cffRunner) options.cffRunner.close();
        if (uiServer) uiServer.close();
        if (options.logStream) options.logStream.end();
        // Destroy all open sockets so the server closes immediately
        (mainServer as any).closeAllConnections?.();
        for (const socket of openSockets) { try { socket.destroy(); } catch {} }
        openSockets.clear();
        return new Promise((resolve) => mainServer.close(() => resolve(null)));
    };

    return mainServer;
}
