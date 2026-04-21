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
     */
    constructor(private directory: string) {}

    public async fetch(req: any, res: any, options: any, body?: Buffer): Promise<void> {
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

        // AWS REST API/CloudFront doesn't auto-index (403 for directories)
        if (options.mode === 'rest' && cleanPath !== '/') {
            if (isActuallyDir) {
                res.statusCode = 403;
                // Provider contract: await full flush before resolving
                await new Promise<void>((resolve, reject) => {
                    res.on('finish', resolve);
                    res.on('error', reject);
                    res.end('Directory indexing is disabled in strict mode');
                });
                return;
            }
        }

        // High Fidelity Logging: Show the preserved query string in the console output
        const [, qs] = req.url.split('?');
        const displayQs = qs ? `?${qs}` : '';
        res.resolvedUri = `file://${fullPath}${isActuallyDir ? '/index.html' : ''}${displayQs}`.replace(/(?<!:)\/\//g, '/');

        if (fs.existsSync(fullPath)) {
            if (fullPath.endsWith('.br')) res.setHeader('content-encoding', 'br');
            if (fullPath.endsWith('.gz')) res.setHeader('content-encoding', 'gzip');
        }

        // CloudFront (REST) supports Default Root Object, but not for subfolders.
        if (cleanPath === '/' && isActuallyDir) {
            req.url = '/index.html';
        }

        // High Fidelity Lifecycle: Wait for serve-handler to fully flush the response
        // before resolving, ensuring the Orchestrator captures the full body buffer.
        return new Promise<void>(async (resolve, reject) => {
            res.on('finish', resolve);
            res.on('error', reject);
            
            try {
                await serveHandler(req, res, {
                    public: this.directory,
                    cleanUrls: false,
                    trailingSlash: false,
                    directoryListing: options.mode === 'website'
                });
            } catch (err) {
                reject(err);
            }
        });
    }
}
