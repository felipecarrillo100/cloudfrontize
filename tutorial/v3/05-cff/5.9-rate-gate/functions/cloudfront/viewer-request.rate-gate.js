// 5.9 The Rate Gate (CloudFront Function, runtime 2.0, viewer-request)
// Your API clients use an SDK that sends how many calls it made this minute (x-request-count).
// Clients over the limit get 429 with Retry-After, so well-behaved SDKs back off.
// This trusts the client: it's a courtesy limit, not protection (see README.md).

const LIMIT = 100;

/** @param {CloudFrontFunctionEvent} event (types for the WebUI editor; ignored by CloudFront) */
async function handler(event) {
    const header = event.request.headers['x-request-count'];
    const count = header ? parseInt(header.value, 10) : 0;
    if (count > LIMIT) {
        return {
            statusCode: 429,
            statusDescription: 'Too Many Requests',
            headers: { 'retry-after': { value: '60' }, 'content-type': { value: 'text/plain' } },
            body: `Limit of ${LIMIT} requests per minute exceeded`,
        };
    }
    return event.request;
}
