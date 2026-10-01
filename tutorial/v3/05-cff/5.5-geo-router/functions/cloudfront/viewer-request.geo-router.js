// 5.5 The Geo Router (CloudFront Function, runtime 2.0, viewer-request)
// Serves each country its own site from /countries/<code>/, at the URL the visitor asked for.
// CloudFront Functions can read CloudFront's location headers on viewer-request (Lambda@Edge can't).

const COUNTRIES = ['FR', 'MX', 'US'];

/** @param {CloudFrontFunctionEvent} event (types for the WebUI editor; ignored by CloudFront) */
async function handler(event) {
    const request = event.request;
    if (request.uri.startsWith('/countries/')) {
        return request; // already localized (links inside a country site)
    }
    const header = request.headers['cloudfront-viewer-country'];
    const country = header && COUNTRIES.includes(header.value) ? header.value : 'US';
    // S3 REST origins don't add index.html to folder requests
    const uri = request.uri.endsWith('/') ? request.uri + 'index.html' : request.uri;
    request.uri = `/countries/${country}${uri}`;
    return request;
}
