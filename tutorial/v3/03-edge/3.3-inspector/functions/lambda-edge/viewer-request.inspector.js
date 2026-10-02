'use strict';

/**
 * 3.3 The Inspector (Lambda@Edge, viewer-request)
 * Blocks requests whose body contains well-known SQL injection patterns, before they reach the origin.
 * A teaching example of body inspection, not a replacement for AWS WAF.
 */
const SIGNATURES = [/\bdrop\s+table\b/i, /\bunion\s+select\b/i, /'\s*or\s+'?1'?\s*=\s*'?1/i, /;\s*--/];

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    // The body is only there when "Include body" is enabled, and always arrives base64-encoded
    if (!request.body || !request.body.data) return request;

    const body = Buffer.from(request.body.data, 'base64').toString('utf8');
    const threat = SIGNATURES.find(pattern => pattern.test(body));
    if (!threat) return request;

    console.log(`[Inspector] Blocked ${request.method} ${request.uri}: matches ${threat}`);
    return {
        status: '403',
        statusDescription: 'Forbidden',
        headers: { 'content-type': [{ key: 'Content-Type', value: 'text/plain' }] },
        body: 'Request blocked.',
    };
};
