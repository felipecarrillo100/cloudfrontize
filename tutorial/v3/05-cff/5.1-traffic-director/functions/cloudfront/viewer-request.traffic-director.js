// 5.1 The Traffic Director (CloudFront Function, runtime 2.0, viewer-request)
// The old campaign URL /promo moved to /summer-sale: send visitors there with a permanent redirect,
// keeping any query string (?ref=newsletter), before the request reaches the cache.

/** @param {CloudFrontFunctionEvent} event (types for the WebUI editor; ignored by CloudFront) */
async function handler(event) {
    const request = event.request;
    if (request.uri !== '/promo') {
        return request;
    }
    const query = Object.keys(request.querystring).map(name => `${name}=${request.querystring[name].value}`).join('&');
    return {
        statusCode: 301,
        statusDescription: 'Moved Permanently',
        headers: { location: { value: '/summer-sale' + (query ? `?${query}` : '') } },
    };
}
