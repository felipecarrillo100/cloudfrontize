// Single-page app routing (CloudFront Function, runtime 2.0, viewer-request).
// Paths without a file extension (/, /settings, /users/42) are app routes: CloudFront fetches
// /index.html for them and the app's router renders the page. Paths with an extension
// (/assets/app.js, /favicon.ico) are files and are fetched as they are.

/** @param {CloudFrontFunctionEvent} event (types for the WebUI editor; ignored by CloudFront) */
async function handler(event) {
    const request = event.request;
    const lastSegment = request.uri.split('/').pop();
    if (!lastSegment.includes('.')) {
        request.uri = '/index.html';
    }
    return request;
}
