import http from 'http';
import fs from 'fs';
import path from 'path';
import { Telemetry } from './Telemetry';
import { Orchestrator } from './Orchestrator';
import { exec } from 'child_process';
import { TransformationLevel } from '../core/CodeProcessor';

export class WebUI {
    constructor(private telemetry: Telemetry, private orchestrator: Orchestrator, private options: any) {}

    public handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
        const url = req.url || '/';

        // Event Stream (SSE)
        if (url === '/events') {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            });

            // Initial connection: Send history but strip heavy details (Lazy-Fetch)
            const history = this.telemetry.getHistory().map(h => ({
                ...h,
                details: { ...h.details, headers: undefined, body: undefined }
            }));

            const initData = JSON.stringify({
                type: 'init',
                port: this.options.port,
                version: '1.10.2',
                history
            });
            res.write(`data: ${initData}\n\n`);

            const onEvent = (event: any) => {
                // Strip body but keep headers for real-time diagnostic parity
                const lightEvent = {
                    ...event,
                    details: { ...event.details, body: undefined }
                };
                res.write(`data: ${JSON.stringify(lightEvent)}\n\n`);
            };

            this.telemetry.on('event', onEvent);
            req.on('close', () => this.telemetry.removeListener('event', onEvent));
            return;
        }

        // Detailed Request View (Lazy-Fetch History)
        if (url.startsWith('/api/detail/')) {
            const id = url.split('/').pop();
            const events = this.telemetry.getHistory().filter(e => e.id === id);
            res.writeHead(events.length > 0 ? 200 : 404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(events.length > 0 ? events : { error: 'Not found' }));
            return;
        }

        // Distribution Overview & Code Mirroring (Fidelity Cloud)
        if (url === '/api/distribution') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(this.orchestrator.getDistribution()));
            return;
        }

        // Hook Control (Bypass/Isolate/Reset)
        if (url === '/api/hooks/control' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                try {
                    const { id, disabled, isolate, reset, disableAll } = JSON.parse(body);
                    if (reset) {
                        this.orchestrator.resetHooks();
                    } else if (disableAll) {
                        this.orchestrator.disableAllHooks();
                    } else if (isolate) {
                        this.orchestrator.isolateHook(id);
                    } else {
                        this.orchestrator.toggleHook(id, !!disabled);
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                } catch (err: any) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Invalid JSON' }));
                }
            });
            return;
        }

        // Open in Editor (Local Shell Integration)
        if (url.startsWith('/api/open-editor')) {
            const query = new URL(url, `http://${req.headers.host}`).searchParams;
            const filePath = query.get('path');
            if (filePath && fs.existsSync(filePath)) {
                // Determine platform-specific open command
                const cmd = process.platform === 'win32' ? 'start' : (process.platform === 'darwin' ? 'open' : 'xdg-open');
                // Try 'code' (VS Code) first, fall back to default
                exec(`code "${filePath}" || ${cmd} "${filePath}"`, (err) => {
                    if (err) {
                        console.error(`🛑 [WebUI] Could not open editor for: ${filePath}`);
                    }
                });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } else {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'File not found' }));
            }
            return;
        }

        // Production Export (Baked/Minified/Uglified)
        if (url.startsWith('/api/production-code')) {
            const query = new URL(url, `http://${req.headers.host}`).searchParams;
            const id = query.get('id');
            const level = (query.get('level') || 'baked') as TransformationLevel;

            if (id) {
                this.orchestrator.getProductionCode(id, level).then(code => {
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end(code);
                }).catch(err => {
                    res.writeHead(500);
                    res.end(`// Error: ${err.message}`);
                });
            } else {
                res.writeHead(400);
                res.end('// Error: Missing ID');
            }
            return;
        }

        // Header Intelligence (Sticky Headers)
        if (url === '/api/sticky') {
            if (req.method === 'GET') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(this.orchestrator.getStickyHeaders()));
                return;
            }
            
            if (req.method === 'POST') {
                let body = '';
                req.on('data', chunk => { body += chunk; });
                req.on('end', () => {
                    try {
                        const config = JSON.parse(body);
                        this.orchestrator.setStickyHeaders(config);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true }));
                    } catch (err: any) {
                        res.writeHead(400);
                        res.end(JSON.stringify({ error: 'Invalid JSON' }));
                    }
                });
                return;
            }
        }

        // Static Assets
        const cleanPath = url.split('?')[0];
        const assetName = cleanPath === '/' ? 'index.html' : cleanPath.slice(1);
        
        let uiAssetPath = path.join(__dirname, '..', '..', 'ui', assetName);
        if (!fs.existsSync(uiAssetPath)) {
            // Check in dist if running from dist
            uiAssetPath = path.join(__dirname, '..', 'ui', assetName);
        }

        if (fs.existsSync(uiAssetPath) && fs.lstatSync(uiAssetPath).isFile()) {
            const ext = path.extname(uiAssetPath);
            const types: any = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml' };
            res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
            fs.createReadStream(uiAssetPath).pipe(res);
        } else {
            res.writeHead(404);
            res.end('Not Found');
        }
    }
}
