// Security headers (CloudFront Function, runtime 2.0, viewer-response).
// Added to every response the viewer gets, whether it came from the origin or the cache.
// Adjust the Content-Security-Policy to what your site loads.

const HEADERS = {
    'strict-transport-security': 'max-age=63072000; includeSubDomains; preload',
    'content-security-policy': "default-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
};

/** @param {CloudFrontFunctionEvent} event (types for the WebUI editor; ignored by CloudFront) */
async function handler(event) {
    const headers = event.response.headers;
    Object.keys(HEADERS).forEach(name => {
        headers[name] = { value: HEADERS[name] };
    });
    return event.response;
}
