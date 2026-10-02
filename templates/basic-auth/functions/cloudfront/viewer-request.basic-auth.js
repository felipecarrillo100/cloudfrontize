// HTTP Basic authentication (CloudFront Function, runtime 2.0, viewer-request).
// Attached to the /admin/* cache behavior only, so the rest of the site stays public.
//
// The demo credentials are admin / change-me. Don't keep credentials in code for real use:
// read them from a key value store, or put an identity provider in front (see README.md).
const EXPECTED = 'Basic ' + 'YWRtaW46Y2hhbmdlLW1l'; // base64("admin:change-me")

/** @param {CloudFrontFunctionEvent} event (types for the WebUI editor; ignored by CloudFront) */
async function handler(event) {
    const authorization = event.request.headers.authorization;
    if (authorization && authorization.value === EXPECTED) {
        return event.request;
    }
    return {
        statusCode: 401,
        statusDescription: 'Unauthorized',
        headers: { 'www-authenticate': { value: 'Basic realm="Admin", charset="UTF-8"' } },
    };
}
