// 5.7 The A/B Router (CloudFront Function, runtime 2.0, viewer-request)
// The landing page has two versions. Each visitor is put in group A or B once (a cookie set by a
// redirect), then always sees the same version, at the same URL.

const COOKIE = 'ab_test_group';
const PAGES = { A: '/landing/original.html', B: '/landing/new-design.html' };

/** @param {CloudFrontFunctionEvent} event (types for the WebUI editor; ignored by CloudFront) */
async function handler(event) {
    const request = event.request;
    if (request.uri !== '/' && request.uri !== '/index.html') {
        return request; // assets and other pages aren't part of the test
    }

    const cookie = request.cookies[COOKIE];
    const group = cookie && PAGES[cookie.value] ? cookie.value : null;
    if (!group) {
        // A request can't set a cookie: answer with a redirect to the same URL that sets it
        const cookies = {};
        cookies[COOKIE] = { value: Math.random() < 0.5 ? 'A' : 'B', attributes: 'Path=/; Max-Age=604800; SameSite=Lax' };
        return {
            statusCode: 302,
            statusDescription: 'Found',
            headers: { location: { value: request.uri }, 'cache-control': { value: 'no-store' } },
            cookies,
        };
    }
    request.uri = PAGES[group];
    return request;
}
