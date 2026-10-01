// A/B test of the home page (CloudFront Function, runtime 2.0, viewer-request).
// A visitor without the experiment cookie gets one (variant a or b, half each) through a redirect
// to the same URL; with the cookie, the home page is served from /experiments/home-<variant>.html.
// Everyone keeps seeing the same variant for 30 days.

const COOKIE = 'experiment-home';
const VARIANTS = ['a', 'b'];
const IN_EXPERIMENT = ['/', '/index.html'];

/** @param {CloudFrontFunctionEvent} event (types for the WebUI editor; ignored by CloudFront) */
async function handler(event) {
    const request = event.request;
    if (!IN_EXPERIMENT.includes(request.uri)) {
        return request;
    }

    const cookie = request.cookies[COOKIE];
    const variant = cookie && VARIANTS.includes(cookie.value) ? cookie.value : null;

    if (!variant) {
        const chosen = Math.random() < 0.5 ? 'a' : 'b';
        const cookies = {};
        cookies[COOKIE] = { value: chosen, attributes: 'Path=/; Max-Age=2592000; SameSite=Lax' };
        return {
            statusCode: 302,
            statusDescription: 'Found',
            headers: {
                location: { value: request.uri + queryString(request.querystring) },
                'cache-control': { value: 'no-store' },
            },
            cookies,
        };
    }

    request.uri = `/experiments/home-${variant}.html`;
    return request;
}

function queryString(querystring) {
    const parts = Object.keys(querystring).map(name => `${name}=${querystring[name].value}`);
    return parts.length ? `?${parts.join('&')}` : '';
}
