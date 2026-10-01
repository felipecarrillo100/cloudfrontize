// 5.3 The Simple Blocker (CloudFront Function, runtime 2.0, viewer-request)
// The /admin area must never be reachable through the public distribution.

const BLOCKED = ['/admin', '/.env', '/.git'];

/** @param {CloudFrontFunctionEvent} event (types for the WebUI editor; ignored by CloudFront) */
async function handler(event) {
    const uri = event.request.uri.toLowerCase();
    // "/admin" and everything under "/admin/", but not "/administrators-guide.html"
    const blocked = BLOCKED.some(prefix => uri === prefix || uri.startsWith(prefix + '/'));
    if (!blocked) {
        return event.request;
    }
    return {
        statusCode: 403,
        statusDescription: 'Forbidden',
        headers: { 'content-type': { value: 'text/plain' } },
        body: 'Forbidden',
    };
}
