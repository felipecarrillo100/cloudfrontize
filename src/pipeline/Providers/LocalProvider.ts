import fs from 'fs';
import path from 'path';
// @ts-ignore - serve-handler doesn't have good types
import serveHandler from 'serve-handler';
import { OriginProvider } from './base';

/**
 * Serves assets from a local directory.
 * 
 * @namespace Backend
 * Used when the CloudFront origin points to a local folder (e.g. `--origins ./www`).
 * It emulates S3-like behaviors such as "Default Root Object" and 403s for directory indexing.
 */
export class LocalProvider implements OriginProvider {
    /**
     * @param directory - The base directory to serve files from.
     * @param mode - Per-origin S3 behavior (project manifests); falls back to the request-level mode (2.x `-m`).
     */
    constructor(private directory: string, private mode?: 'rest' | 'website') {}

    public async fetch(req: any, res: any, options: any, body?: Buffer): Promise<void> {
        const mode = this.mode ?? options.mode;
        // If we have a mutated or captured body buffer, we must ensure the provider
        // (and its sub-handlers like serve-handler) can read it as a stream.
        if (body) {
            const { Readable } = require('stream');
            const bodyStream = Readable.from(body);
            // Re-map the stream properties that serve-handler expects
            bodyStream.headers = req.headers;
            bodyStream.method = req.method;
            bodyStream.url = req.url;
            req = bodyStream;
        }
        const cleanPath = req.url.split('?')[0];
        const fullPath = path.resolve(this.directory, cleanPath.startsWith('/') ? cleanPath.slice(1) : cleanPath);
        
        let isActuallyDir = false;
        try {
            const stats = fs.statSync(fullPath);
            isActuallyDir = stats.isDirectory();
        } catch (e) {}

        // AWS REST API/CloudFront doesn't auto-index (404 for directories because object doesn't exist)
        // S3 Website redirects /folder to /folder/ and serves index.html
        
        // High Fidelity Logging: Show the preserved query string in the console output
        const [, qs] = req.url.split('?');
        const displayQs = qs ? `?${qs}` : '';
        res.resolvedUri = `file://${fullPath}${isActuallyDir ? '/index.html' : ''}${displayQs}`.replace(/(?<!:)\/\//g, '/');

        if (fs.existsSync(fullPath)) {
            if (fullPath.endsWith('.br')) res.setHeader('content-encoding', 'br');
            if (fullPath.endsWith('.gz')) res.setHeader('content-encoding', 'gzip');
        }

        // S3 Website Fidelity: Handle trailing slash redirects and index documents
        if (mode === 'website' && isActuallyDir) {
            if (!cleanPath.endsWith('/')) {
                // Redirect /folder to /folder/
                res.statusCode = 301;
                res.setHeader('Location', cleanPath + '/' + displayQs);
                res.end();
                return;
            } else {
                // Serve index.html for folders with trailing slash
                req.url = cleanPath + 'index.html' + displayQs;
            }
        }

        // CloudFront (REST) Fidelity: Non-root directories always 404 (object not found)
        if (mode === 'rest' && isActuallyDir && cleanPath !== '/') {
            res.statusCode = 404;
            res.end();
            return;
        }

        // Default Root Object: Supported by both REST (for root only) and Website (for all folders).
        // Here we handle the root case for ALL modes to maintain compatibility.
        if (cleanPath === '/' && isActuallyDir) {
            req.url = '/index.html' + displayQs;
        }

        // S3 Fidelity: S3 sends both ETag and Last-Modified, but serve-handler emits only one of them.
        // With ETags enabled (default; `--no-etag` disables), add Last-Modified for the file actually served.
        const etag = options.etag !== false;
        if (etag) {
            try {
                const servedPath = path.join(this.directory, decodeURIComponent(req.url.split('?')[0]));
                const servedStats = fs.statSync(servedPath);
                if (servedStats.isFile()) res.setHeader('Last-Modified', servedStats.mtime.toUTCString());
            } catch (e) {}
        }

        // High Fidelity Lifecycle: Wait for serve-handler to fully flush the response
        return new Promise<void>(async (resolve, reject) => {
            res.on('finish', resolve);
            res.on('error', reject);
            
            try {
                await serveHandler(req, res, {
                    public: this.directory,
                    cleanUrls: false,
                    trailingSlash: false, // Handled manually for high fidelity
                    directoryListing: false,
                    etag
                });
            } catch (err) {
                reject(err);
            }
        });
    }
}
