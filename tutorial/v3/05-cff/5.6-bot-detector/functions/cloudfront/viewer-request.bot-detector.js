// 5.6 The Bot Detector (CloudFront Function, runtime 2.0, viewer-request)
// Blocks scrapers that announce themselves in the User-Agent, but lets search engines in.

const ALLOWED = ['googlebot', 'bingbot', 'duckduckbot'];
const BLOCKED = ['bot', 'spider', 'crawler', 'scrapy', 'python-requests', 'curl/'];

/** @param {CloudFrontFunctionEvent} event (types for the WebUI editor; ignored by CloudFront) */
async function handler(event) {
    const header = event.request.headers['user-agent'];
    const ua = header ? header.value.toLowerCase() : '';
    if (!ua) {
        return forbidden('A User-Agent is required');
    }
    if (ALLOWED.some(name => ua.includes(name))) {
        return event.request;
    }
    if (BLOCKED.some(word => ua.includes(word))) {
        return forbidden('Automated access is not allowed');
    }
    return event.request;
}

function forbidden(message) {
    return { statusCode: 403, statusDescription: 'Forbidden', headers: { 'content-type': { value: 'text/plain' } }, body: message };
}
