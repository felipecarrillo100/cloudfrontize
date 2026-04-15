import fs from 'fs';
import path from 'path';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
// @ts-ignore - serve-handler doesn't have good types
import serveHandler from 'serve-handler';
import { OriginConfig } from '../core/types';

export interface OriginProvider {
    fetch(req: any, res: any, options: any, body?: Buffer): Promise<void>;
}

export class LocalProvider implements OriginProvider {
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

    public async fetch(req: any, res: any, _options: any, _body?: Buffer): Promise<void> {
        const key = req.url.startsWith('/') ? req.url.slice(1) : req.url;
        res.resolvedUri = `s3://${this.config.bucket}/${key || 'index.html'}`;
        
        try {
            const command = new GetObjectCommand({
                Bucket: this.config.bucket,
                Key: key || 'index.html'
            });
            const response = await this.client.send(command);
            
            res.statusCode = response.$metadata.httpStatusCode || 200;
            
            // Fidelity Header Propagation: Map SDK response properties to headers
            const skipProps = ['$metadata', 'Body', 'Metadata']; // Skip Metadata object to prevent [object Object]
            for (const [k, v] of Object.entries(response)) {
                if (skipProps.includes(k) || v === undefined || v === null) continue;
                
                // Fidelity Guard: Only promote primitives to headers to avoid [object Object] leaks
                if (typeof v !== 'string' && typeof v !== 'number' && !(v instanceof Date)) continue;

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
            
            // Stream the S3 body to the response and await full completion
            const body = response.Body as any;
            await new Promise<void>((resolve, reject) => {
                res.on('finish', resolve);
                res.on('error', reject);
                if (body && typeof body.pipe === 'function') {
                    body.on('error', reject);
                    body.pipe(res, { end: true });
                } else {
                    response.Body?.transformToByteArray()
                        .then(bytes => res.end(bytes))
                        .catch(reject);
                }
            });
        } catch (err: any) {
            // S3 Protocol Fidelity: Evidence-based property paths from SDK probe
            // Probe confirmed: status is in err.$metadata.httpStatusCode
            //                  headers are in err.$response.headers (NOT $metadata.httpHeaders)
            const status = err.$metadata?.httpStatusCode || 502;
            const headers: Record<string, string> = (err.$response as any)?.headers || {};

            res.statusCode = status;

            // Proxy all real S3/MinIO response headers (x-amz-request-id, server, content-type, etc.)
            for (const [k, v] of Object.entries(headers)) {
                res.setHeader(k, String(v));
            }

            // Ensure Content-Type is application/xml if S3 didn't send one
            if (!res.getHeader('content-type')) {
                res.setHeader('Content-Type', 'application/xml');
            }

            // CloudFront Fidelity: Reconstruct the S3 XML body.
            // NOTE: err.$response.body is always destroyed by the SDK before we reach the catch block
            // (it consumes the body to parse err.name and err.message). We therefore reconstruct
            // using the SDK properties that are proven available from our diagnostic probe.
            const requestId = err.$metadata?.requestId || headers['x-amz-request-id'] || 'N/A';
            const hostId = err.$metadata?.extendedRequestId || headers['x-amz-id-2'] || 'N/A';
            const errorCode = err.name || (status === 404 ? 'NoSuchKey' : status === 403 ? 'AccessDenied' : 'OriginError');

            await new Promise<void>((resolve, reject) => {
                res.on('finish', resolve);
                res.on('error', reject);
                res.end(`<?xml version="1.0" encoding="UTF-8"?>
<Error>
    <Code>${errorCode}</Code>
    <Message>${err.message || 'S3 Origin Error'}</Message>
    <RequestId>${requestId}</RequestId>
    <HostId>${hostId}</HostId>
</Error>`);
            });
        }
    }
}
