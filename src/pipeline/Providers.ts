import fs from 'fs';
import path from 'path';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
// @ts-ignore - serve-handler doesn't have good types
import serveHandler from 'serve-handler';
import { OriginConfig } from '../core/types';

export interface OriginProvider {
    fetch(req: any, res: any, options: any): Promise<void>;
}

export class LocalProvider implements OriginProvider {
    constructor(private directory: string) {}

    public async fetch(req: any, res: any, options: any): Promise<void> {
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
                res.end('Directory indexing is disabled in strict mode');
                return;
            }
        }

        res.resolvedUri = `file://${fullPath}${isActuallyDir ? '/index.html' : ''}`.replace(/(?<!:)\/\//g, '/');

        if (fs.existsSync(fullPath)) {
            if (fullPath.endsWith('.br')) res.setHeader('content-encoding', 'br');
            if (fullPath.endsWith('.gz')) res.setHeader('content-encoding', 'gzip');
        }

        // CloudFront (REST) supports Default Root Object, but not for subfolders.
        if (cleanPath === '/' && isActuallyDir) {
            req.url = '/index.html';
        }

        return serveHandler(req, res, {
            public: this.directory,
            cleanUrls: false,
            trailingSlash: false,
            directoryListing: options.mode === 'website'
        });
    }
}

export class S3Provider implements OriginProvider {
    private client: S3Client;

    constructor(private config: OriginConfig) {
        const s3Options: any = {
            region: config.region || process.env.AWS_REGION || 'us-east-1',
        };

        if (config.endpoint) {
            s3Options.endpoint = config.endpoint;
            s3Options.forcePathStyle = config.forcePathStyle !== undefined ? config.forcePathStyle : true; 
        }

        if (config.credentials) {
            s3Options.credentials = {
                accessKeyId: config.credentials.accessKeyId,
                secretAccessKey: config.credentials.secretAccessKey,
                sessionToken: config.credentials.sessionToken
            };
        }

        this.client = new S3Client(s3Options);
    }

    public async fetch(req: any, res: any, _options: any): Promise<void> {
        const key = req.url.startsWith('/') ? req.url.slice(1) : req.url;
        res.resolvedUri = `s3://${this.config.bucket}/${key || 'index.html'}`;
        
        try {
            const command = new GetObjectCommand({
                Bucket: this.config.bucket,
                Key: key || 'index.html'
            });
            const response = await this.client.send(command);
            
            res.statusCode = response.$metadata.httpStatusCode || 200;
            
            // Fidelity Header Propagation: Map all SDK response properties to headers
            const skipProps = ['$metadata', 'Body'];
            for (const [k, v] of Object.entries(response)) {
                if (skipProps.includes(k) || v === undefined || v === null) continue;
                
                // Map SDK PascalCase property names to standard HTTP header-case where possible
                let headerKey = k;
                if (k === 'ContentType') headerKey = 'Content-Type';
                else if (k === 'ContentLength') headerKey = 'Content-Length';
                else if (k === 'LastModified') headerKey = 'Last-Modified';
                else if (k === 'ETag') headerKey = 'ETag';
                else if (k === 'CacheControl') headerKey = 'Cache-Control';
                else if (k === 'ContentEncoding') headerKey = 'Content-Encoding';
                else if (k === 'ContentLanguage') headerKey = 'Content-Language';
                else if (k === 'Expires') headerKey = 'Expires';
                else if (k === 'VersionId') headerKey = 'x-amz-version-id';
                else if (k === 'AcceptRanges') headerKey = 'Accept-Ranges';
                
                res.setHeader(headerKey, v instanceof Date ? v.toUTCString() : String(v));
            }

            // Also capture raw HTTP headers from metadata for maximum fidelity (MinIO specials)
            const rawHeaders = (response.$metadata as any).httpHeaders || {};
            for (const [k, v] of Object.entries(rawHeaders)) {
                res.setHeader(k, String(v));
            }
            
            // Stream the S3 body to the response
            const body = response.Body as any;
            if (body && typeof body.pipe === 'function') {
                body.pipe(res);
            } else {
                res.end(await response.Body?.transformToByteArray());
            }
        } catch (err: any) {
            if (err.name === 'NoSuchKey' || err.name === 'NotFound') {
                res.statusCode = 404;
                res.end('S3: Not Found');
            } else {
                res.statusCode = 502;
                if (req._logTree) {
                    req._logTree.push(` ╰─ \x1b[31m[S3 Error]\x1b[0m ${err.message}`);
                }
                res.end(`S3 Origin Error: ${err.message}`);
            }
        }
    }
}
