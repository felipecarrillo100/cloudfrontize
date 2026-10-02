// 5.10 The Cookie Gate, part 1 (CloudFront Function, runtime 2.0, viewer-request)
// A metered paywall: 5 free articles, counted in a cookie. Readers over the limit go to /subscribe.html.

const COOKIE = 'articles-read';
const FREE = 5;

/** @param {CloudFrontFunctionEvent} event (types for the WebUI editor; ignored by CloudFront) */
async function handler(event) {
    const cookie = event.request.cookies[COOKIE];
    const read = cookie ? parseInt(cookie.value, 10) || 0 : 0;
    if (read >= FREE) {
        return {
            statusCode: 302,
            statusDescription: 'Found',
            headers: { location: { value: '/subscribe.html' }, 'cache-control': { value: 'no-store' } },
        };
    }
    return event.request;
}
