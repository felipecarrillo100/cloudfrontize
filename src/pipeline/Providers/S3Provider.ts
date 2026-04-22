import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { OriginProvider } from './base';
import { OriginConfig } from '../../core/types';

/**
 * Proxies requests to an S3-compatible service (AWS S3 or MinIO).
 * 
 * @namespace Backend
 * This provider uses the `@aws-sdk/client-s3` to fetch assets. It supports
 * custom endpoints (for MinIO), path-style addressing, and AWS credentials.
 * It also handles the mapping of S3 response properties (e.g. `ContentType`, `ETag`)
 * to standard HTTP headers.
 * 
 * @see {@link https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html | AWS S3 Documentation}
 */
export class S3Provider implements OriginProvider {
    private client: S3Client;

    /**
     * @param config - The origin configuration including bucket and endpoint.
     */
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
        // Fidelity: S3 Keys represent the path. Query parameters must be stripped before key calculation.
        const [pathOnly, qs] = req.url.split('?');
        const key = pathOnly.startsWith('/') ? pathOnly.slice(1) : pathOnly;
        
        // Append query string to resolvedUri for diagnostic logging
        const displayQs = qs ? `?${qs}` : '';
        res.resolvedUri = `s3://${this.config.bucket}/${key || 'index.html'}${displayQs}`;
        
        try {
            const command = new GetObjectCommand({
                Bucket: this.config.bucket,
                Key: key || 'index.html'
            });
            const response = await this.client.send(command);
            
            res.statusCode = response.$metadata.httpStatusCode || 200;
            
            // Fidelity Header Propagation: Map SDK response properties to headers
            const skipProps = ['$metadata', 'Body', 'Metadata']; // Skip Metadata object to prevent [object Object] leaks
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
            const baseMessage = err.message || 'S3 Origin Error';
            
            // Fidelity-Aware Context Injection: We only prefix the message if the SDK 
            // failed before receiving a real HTTP response from the network (no httpStatusCode).
            // This ensures 100% fidelity for real S3 errors while fixing environment-level crashes.
            const finalMessage = (!err.$metadata?.httpStatusCode && requestId === 'N/A') 
                ? `S3 Origin Error: ${baseMessage}` 
                : baseMessage;

            await new Promise<void>((resolve, reject) => {
                res.on('finish', resolve);
                res.on('error', reject);
                res.end(`<?xml version="1.0" encoding="UTF-8"?>
<Error>
    <Code>${errorCode}</Code>
    <Message>${finalMessage}</Message>
    <RequestId>${requestId}</RequestId>
    <HostId>${hostId}</HostId>
</Error>`);
            });
        }
    }
}
