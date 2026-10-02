import http from 'http';
import fs from 'fs';
import path from 'path';
import { Telemetry } from './Telemetry';
import type { ProjectRuntime } from '../runtime/ProjectRuntime';
import { EventHub } from '../api/EventHub';
import { createApiV2, ProjectControl } from '../api/v2';
import type { Router } from '../api/router';
import { ApiError } from '../api/errors';

export interface WebUIHost {
    /** The ports actually listened on (they differ from the options when 0 asked for an ephemeral port). */
    ports?: () => { main: number; webui: number };
    /** The server's project operations (open, reload, save). */
    projects?: () => ProjectControl;
}

export class WebUI {
    readonly events: EventHub;
    private readonly api: Router;

    /** @param getRuntime - Returns the project runtime currently being served (it changes when a project is opened). */
    constructor(private telemetry: Telemetry, private getRuntime: () => ProjectRuntime, private options: any, host: WebUIHost = {}) {
        this.events = new EventHub(telemetry);
        this.api = createApiV2({
            telemetry,
            events: this.events,
            runtime: getRuntime,
            ports: host.ports ?? (() => ({ main: Number(options.port), webui: Number(options.webui) })),
            projects: host.projects ?? (() => { throw new ApiError(409, 'no-project', 'Project operations are not available on this server'); })
        });
    }

    /** Ends open event streams and detaches from telemetry. */
    close(): void {
        this.events.close();
    }

    /**
     * Security: the Developer UI only answers requests addressed to this machine by its own
     * same-origin page. Blocks cross-site requests (a foreign Origin) and DNS rebinding (a foreign
     * Host). API v2 adds a second layer: changes must be JSON, which needs a CORS preflight.
     */
    private _isAllowedRequest(req: http.IncomingMessage): boolean {
        const port = String(req.socket.localPort);
        const allowedHosts = [`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`];
        if (!allowedHosts.includes(String(req.headers.host || '').toLowerCase())) return false;

        const origin = req.headers.origin;
        if (origin === undefined) return true;
        return allowedHosts.some(h => String(origin).toLowerCase() === `http://${h}`);
    }

    public handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
        const url = req.url || '/';

        if (!this._isAllowedRequest(req)) {
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end('Forbidden: the Developer UI only accepts requests from localhost');
            return;
        }

        // WebUI API v2
        if (this.api.matches(url)) {
            void this.api.handle(req, res);
            return;
        }

        // Static Assets
        const cleanPath = url.split('?')[0];
        const assetName = cleanPath === '/' ? 'index.html' : cleanPath.slice(1);
        
        let uiRoot = this.options.uiDir
            ? path.resolve(this.options.uiDir)
            : path.resolve(__dirname, '..', '..', 'ui');
        if (!this.options.uiDir && !fs.existsSync(path.join(uiRoot, assetName))) {
            // Check in dist if running from dist
            uiRoot = path.resolve(__dirname, '..', 'ui');
        }
        const uiAssetPath = path.resolve(uiRoot, assetName);

        // Security: never serve files outside the UI directory (e.g. raw `/../package.json` requests)
        const insideUiRoot = uiAssetPath.startsWith(uiRoot + path.sep);

        if (insideUiRoot && fs.existsSync(uiAssetPath) && fs.lstatSync(uiAssetPath).isFile()) {
            const ext = path.extname(uiAssetPath);
            const types: any = {
                '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.map': 'application/json',
                '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2'
            };
            res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
            fs.createReadStream(uiAssetPath).pipe(res);
        } else {
            res.writeHead(404);
            res.end('Not Found');
        }
    }
}
