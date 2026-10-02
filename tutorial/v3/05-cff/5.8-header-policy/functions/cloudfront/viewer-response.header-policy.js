// 5.8 The Header Policy (CloudFront Function, runtime 2.0, viewer-response)
// Security headers are response headers: the browser enforces them, so they're added to every
// response the viewer gets (from the origin or the cache).

const POLICY = {
    'strict-transport-security': 'max-age=63072000; includeSubDomains; preload',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'content-security-policy': "default-src 'self'",
    'referrer-policy': 'same-origin',
};

/** @param {CloudFrontFunctionEvent} event (types for the WebUI editor; ignored by CloudFront) */
async function handler(event) {
    const headers = event.response.headers;
    Object.keys(POLICY).forEach(name => {
        headers[name] = { value: POLICY[name] };
    });
    // The server's version is nobody's business
    delete headers['server'];
    return event.response;
}
