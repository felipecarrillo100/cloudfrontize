import http, { IncomingMessage, ServerResponse } from 'http';
import { AWS_LIMITS } from '../constants';
import { Logger, defaultLogger } from '../core/Logger';
import { InMemoryHistoryStore } from '../pipeline/HistoryStore';
import { Telemetry } from '../pipeline/Telemetry';
import { WebUI } from '../pipeline/WebUI';
import { Diagnostic, ManifestConflictError, ManifestError, NoProjectError, PortInUseError, ServerStartError } from '../project/errors';
import { formatDiagnostics } from '../project/format';
import { checkManifest, loadProject } from '../project/loadProject';
import { formatManifest, readRevisioned, writeFileAtomic } from '../project/revision';
import { ProjectWatcher } from './ProjectWatcher';
import { ProjectRuntime, RuntimeSpec } from '../runtime/ProjectRuntime';
import { fromProject, ProjectOverrides } from '../runtime/spec';
import { printBottomBanner, printTopBanner } from './banner';

/** The main HTTP server, with the project lifecycle attached. */
export interface CloudFrontizeServer extends http.Server {
    /** Resolves when the servers are listening; rejects with PortInUseError / ServerStartError / HeaderConfigError. */
    ready: Promise<void>;
    /** The project runtime currently being served. */
    readonly current: ProjectRuntime;
    /** The WebUI's port once listening (null without a WebUI). */
    readonly webuiPort: number | null;
    /**
     * Loads and validates a project, then swaps it in without restarting the servers.
     * @throws {ManifestError} when the project is invalid (the current project keeps running).
     */
    openProject(target: string): Promise<{ diagnostics: Diagnostic[] }>;
    /** Reloads the current project from disk. */
    reload(): Promise<{ diagnostics: Diagnostic[] }>;
    /**
     * Validates and saves the current project's manifest, then reloads it.
     * @param baseRevision - The revision the edit started from.
     * @throws {ManifestConflictError} when the file changed since `baseRevision`.
     * @throws {ManifestError} when the manifest is invalid (nothing is written).
     * @throws {NoProjectError} when serving a 2.x command-line setup.
     */
    saveManifest(manifest: unknown, baseRevision: string): Promise<{ revision: string; diagnostics: Diagnostic[] }>;
    /** Stops watchers, closes the WebUI and all connections, then the server. */
    closeGracefully(): Promise<null>;
}

export interface ServerSettings {
    logger?: Logger;
    /** Settings applied on top of every project's manifest (e.g. from CLI flags). */
    overrides?: ProjectOverrides;
}

/**
 * Builds the long-lived server around an initial runtime spec. Used by both `startServer` (2.x,
 * synchronous) and `createServer` (3.x, async).
 */
export function buildServer(initialSpec: RuntimeSpec, settings: ServerSettings = {}): CloudFrontizeServer {
    const logger = (settings.logger ?? defaultLogger).child('server');
    const telemetry = new Telemetry(new InMemoryHistoryStore(5000));
    let current = new ProjectRuntime(initialSpec, telemetry);
    const options = current.options; // server-level settings (port, webui, banner) come from the initial spec

    const portOf = (server: http.Server | null, fallback: any) => {
        const address = server?.address();
        return address && typeof address === 'object' ? address.port : Number(fallback);
    };
    let uiServer: http.Server | null = null;
    const webui = options.webui !== undefined && options.webui !== false && options.webui !== ''
        ? new WebUI(telemetry, () => current, options, { ports: () => ({ main: portOf(mainServer, options.port), webui: portOf(uiServer, options.webui) }), projects: () => mainServer })
        : null;

    const compressionLib = require('compression');
    const compress = compressionLib({
        threshold: 0,
        filter: (req: any, res: any) => {
            const length = Number(res.getHeader('Content-Length'));
            if (length && length > AWS_LIMITS.COMPRESSION_BYPASS_BYTES) return false;
            return compressionLib.filter(req, res);
        }
    });

    const mainServer = http.createServer((req: IncomingMessage, res: ServerResponse) => {
        // Each request is served by the runtime current when it arrived, even if a project swap happens mid-flight
        const runtime = current;
        const requestOptions = runtime.options;

        // Drain body FIRST (before compression middleware touches the stream)
        const drainAndHandle = async () => {
            const url = req.url || '/';
            const method = req.method || 'GET';

            // URL Normalization: Strip protocol/host if browser sends an absolute URL (common in Chrome for localhost)
            if (url.startsWith('http://') || url.startsWith('https://')) {
                try {
                    const urlObj = new URL(url);
                    req.url = urlObj.pathname + (urlObj.search || '');
                } catch (e) {
                    // Fallback: manual strip if URL is mangled
                    req.url = '/' + url.split('://')[1].split('/').slice(1).join('/');
                }
            }

            // Ensure path starts with /
            const finalUrl = req.url || '/';
            if (!finalUrl.startsWith('/')) req.url = '/' + finalUrl;

            let reqBody: Buffer | undefined;
            const hasBody = method !== 'GET' && method !== 'HEAD';

            if (hasBody) {
                try {
                    const chunks: any[] = [];
                    for await (const chunk of req) chunks.push(chunk);
                    reqBody = Buffer.concat(chunks);
                } catch (err: any) {
                    logger.error(`\x1b[31m[CloudFrontize] Body Read error: ${err.message}\x1b[0m`);
                    if (!res.writableEnded) { res.statusCode = 400; res.end('Bad Request'); }
                    return;
                }
            }

            // --cors: answer real preflights directly (browsers send them before non-simple requests)
            if (requestOptions.cors && method === 'OPTIONS' && req.headers['access-control-request-method']) {
                res.writeHead(204, {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': String(req.headers['access-control-request-method']),
                    'Access-Control-Allow-Headers': String(req.headers['access-control-request-headers'] || '*'),
                    'Access-Control-Max-Age': '86400'
                });
                res.end();
                return;
            }

            const handle = () => {
                runtime.orchestrator.handleRequest(req, res, requestOptions, reqBody).catch((err: any) => {
                    logger.error(`\x1b[31m[CloudFrontize] Internal Error: ${err.message}\x1b[0m`);
                    if (!res.writableEnded) { res.statusCode = 500; res.end('Internal Server Error'); }
                });
            };

            // Only apply compression for GET/HEAD requests (static file serving).
            // Body requests (POST etc.) go through edge hooks and must not go through compression
            // to avoid ECONNRESET when undici starts reading the response while still uploading.
            const compressionEnabled = requestOptions.compression !== false && !requestOptions.noCompression;
            if (compressionEnabled && !hasBody) {
                compress(req, res, handle);
            } else {
                handle();
            }
        };

        drainAndHandle();
    }) as CloudFrontizeServer;

    // Track open connections so we can forcefully close them during graceful shutdown
    const openSockets = new Set<any>();
    mainServer.on('connection', (socket: any) => {
        openSockets.add(socket);
        socket.on('close', () => openSockets.delete(socket));
    });

    // Disable keep-alive to isolate connections per request (critical for test stability
    // and prevents AggregateError from stale pooled connections in Node.js 18+ undici/http)
    mainServer.keepAliveTimeout = 0;

    const startupError = (err: any, which: 'main' | 'webui', port: any) => {
        const label = which === 'webui' ? 'WebUI ' : '';
        if (err.code === 'EADDRINUSE') {
            logger.error(`\n\x1b[31m🛑 [Error] ${label}Port ${port} is already in use.\x1b[0m`);
            logger.error(`   Please use '${which === 'webui' ? '--webui' : '--port'} <number>' to specify a different port.\n`);
            return new PortInUseError(Number(port), which);
        }
        logger.error(`\n\x1b[31m🛑 [Error] ${label}Server failed to start: ${err.message}\x1b[0m\n`);
        return new ServerStartError(err.message, err);
    };

    const mainReady = new Promise<void>((resolve, reject) => {
        mainServer.once('error', (err: any) => reject(startupError(err, 'main', options.port)));
        mainServer.listen(options.port, () => {
            try {
                current.applyHeaderConfig();
            } catch (err: any) {
                logger.error(`\x1b[31m🛑 [HeaderParser] ${err.message}\x1b[0m`);
                reject(err);
                return;
            }
            if (!options.noBanner) {
                printTopBanner(options, current.project);
                printBottomBanner(options);
            }
            if (options.debug) logger.info(`\n\x1b[32m✔  [Ready] CloudFrontize is serving traffic on port ${options.port}\x1b[0m\n`);
            resolve();
        });
    });

    let uiServer6: http.Server | null = null;
    const uiSockets = new Set<any>();
    let uiReady: Promise<void> = Promise.resolve();
    if (webui) {
        const handler = (req: IncomingMessage, res: ServerResponse) => webui.handleRequest(req, res);
        const track = (server: http.Server) => server.on('connection', (socket: any) => {
            uiSockets.add(socket);
            socket.on('close', () => uiSockets.delete(socket));
        });
        uiServer = track(http.createServer(handler));
        const ui = uiServer;
        uiReady = new Promise<void>((resolve, reject) => {
            ui.once('error', (err: any) => reject(startupError(err, 'webui', options.webui)));
            // Security: loopback only — the Developer UI exposes hook source and baked values
            ui.listen(Number(options.webui), '127.0.0.1', () => {
                // `localhost` often resolves to ::1 first: listen there too, on the same port, so the
                // browser doesn't reach another program that holds that port on IPv6
                const port = portOf(ui, options.webui);
                const ui6 = track(http.createServer(handler));
                ui6.once('error', (err: any) => {
                    if (err.code === 'EADDRINUSE') {
                        logger.warn(`\x1b[33m⚠️  Another program is using [::1]:${port}; http://localhost:${port} may reach it instead of the WebUI. Use http://127.0.0.1:${port}\x1b[0m`);
                    }
                    // EADDRNOTAVAIL / EAFNOSUPPORT: no IPv6 loopback on this machine, nothing to do
                    resolve();
                });
                ui6.listen(port, '::1', () => { uiServer6 = ui6; resolve(); });
            });
        });
    }

    mainServer.ready = Promise.all([mainReady, uiReady]).then(() => watchCurrent());
    // Don't turn an un-awaited startup failure into an unhandled rejection; callers opt in via `ready`
    mainServer.ready.catch(() => {});

    Object.defineProperty(mainServer, 'current', { get: () => current, enumerable: true });
    Object.defineProperty(mainServer, 'webuiPort', { get: () => (uiServer?.listening ? portOf(uiServer, options.webui) : null), enumerable: true });

    // Project operations (open, reload, save, external edits) run one at a time
    let queue: Promise<unknown> = Promise.resolve();
    const serialize = <T>(task: () => Promise<T>): Promise<T> => {
        const run = queue.then(task, task);
        queue = run.catch(() => {});
        return run;
    };

    // Watches the current project's manifest and viewer headers file
    let watcher: ProjectWatcher | null = null;
    // The manifest revision the server already knows about (loaded, or written by saveManifest)
    let knownRevision: string | null = null;
    const broadcastProject = (details: Record<string, unknown>) =>
        telemetry.broadcast({ id: 'SYSTEM_PROJECT', type: 'project', details } as any);

    const watchCurrent = async () => {
        watcher?.close();
        watcher = null;
        const project = current.project;
        if (!project || !current.watches) return;
        knownRevision = project.revision;
        const w = new ProjectWatcher(project.manifestPath, project.viewerHeadersFile, {
            onManifest: (revision) => {
                if (revision === knownRevision) return; // our own write, or no real change
                void serialize(async () => {
                    if (watcher !== w) return; // another project was opened meanwhile
                    try {
                        await openInternal(project.dir, 'disk');
                    } catch (err: any) {
                        knownRevision = revision;
                        const diagnostics: Diagnostic[] = err instanceof ManifestError ? err.diagnostics : [{ severity: 'error', path: '', rule: 'reload', message: err.message }];
                        logger.warn(`\x1b[33m⚠️  ${project.manifestPath} changed but can't be loaded; still serving the previous version\x1b[0m\n${formatDiagnostics(diagnostics)}`);
                        broadcastProject({ action: 'invalid', name: project.manifest.name, dir: project.dir, revision, diagnostics });
                    }
                });
            },
            onViewerHeaders: () => {
                try {
                    current.applyHeaderConfig();
                    broadcastProject({ action: 'viewer-headers', name: project.manifest.name, dir: project.dir, revision: knownRevision });
                } catch (err: any) {
                    logger.error(`\x1b[31m🛑 [HeaderParser] ${err.message}\x1b[0m`);
                }
            }
        });
        watcher = w;
        await w.start();
    };

    const openInternal = async (target: string, source: 'open' | 'api' | 'disk') => {
        const { project, diagnostics } = loadProject(target);
        const next = new ProjectRuntime(fromProject(project, settings.overrides), telemetry);
        try {
            await next.start();
            next.applyHeaderConfig();
        } catch (err) {
            next.dispose();
            throw err;
        }

        const previous = current;
        current = next;
        previous.dispose();

        if (project.manifest.distribution.port !== Number(options.port) && settings.overrides?.port === undefined) {
            logger.warn(`\x1b[33m⚠️  ${project.manifest.name} asks for port ${project.manifest.distribution.port}; it keeps running on ${options.port} until the server restarts\x1b[0m`);
        }
        const sameProject = previous.project?.dir === project.dir;
        await watchCurrent();
        broadcastProject({ action: sameProject ? 'changed' : 'opened', source, name: project.manifest.name, dir: project.dir, revision: project.revision, diagnostics });
        return { diagnostics };
    };

    mainServer.openProject = (target: string) => serialize(() => openInternal(target, 'open'));

    mainServer.reload = () => serialize(async () => {
        if (!current.project) throw new NoProjectError('reload() is only available when serving a project');
        return openInternal(current.project.dir, 'open');
    });

    mainServer.saveManifest = (manifest: unknown, baseRevision: string) => serialize(async () => {
        const project = current.project;
        if (!project) throw new NoProjectError();
        const onDisk = readRevisioned(project.manifestPath);
        if (onDisk.revision !== baseRevision) {
            let parsed: unknown = onDisk.content;
            try { parsed = JSON.parse(onDisk.content); } catch { /* send the raw text */ }
            throw new ManifestConflictError(project.manifestPath, onDisk.revision, parsed);
        }
        const { manifest: valid, diagnostics } = checkManifest(manifest, project.dir);
        if (!valid || diagnostics.some(d => d.severity === 'error')) throw new ManifestError(project.manifestPath, diagnostics);

        knownRevision = writeFileAtomic(project.manifestPath, formatManifest(manifest));
        const result = await openInternal(project.dir, 'api');
        return { revision: knownRevision, diagnostics: result.diagnostics };
    });

    mainServer.closeGracefully = async () => {
        watcher?.close();
        watcher = null;
        current.dispose();
        webui?.close();
        if (uiServer) uiServer.close();
        if (uiServer6) uiServer6.close();
        for (const socket of uiSockets) { try { socket.destroy(); } catch { } }
        uiSockets.clear();
        // Destroy all open sockets so the server closes immediately
        mainServer.closeAllConnections?.();
        for (const socket of openSockets) { try { socket.destroy(); } catch { } }
        openSockets.clear();
        return new Promise((resolve) => mainServer.close(() => resolve(null)));
    };

    return mainServer;
}

export interface CreateServerOptions extends ProjectOverrides {
    /** Project folder or path to its cloudfrontize.json. */
    project: string;
    logger?: Logger;
}

/**
 * Starts a server for a project and resolves once it's listening.
 * @throws {ManifestError} for an invalid project; {PortInUseError} / {ServerStartError} when it can't listen.
 */
export async function createServer(opts: CreateServerOptions): Promise<CloudFrontizeServer> {
    const { project: target, logger, ...overrides } = opts;

    const { project } = loadProject(target);
    const spec = fromProject(project, overrides);
    // A bare --webui means the main port + 1 (an ephemeral port when the main port is 0)
    if (spec.options.webui === true) {
        spec.options.webui = Number(spec.options.port) > 0 ? Number(spec.options.port) + 1 : 0;
    }
    const server = buildServer(spec, { logger, overrides });
    try {
        await server.current.start();
        await server.ready;
    } catch (err) {
        await server.closeGracefully().catch(() => {});
        throw err;
    }
    return server;
}
