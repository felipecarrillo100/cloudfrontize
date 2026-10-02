// 5.10 The Cookie Gate, part 2 (CloudFront Function, runtime 2.0, viewer-response)
// Counts the article the reader just got: the cookie from the request, plus one.

const COOKIE = 'articles-read';

/** @param {CloudFrontFunctionEvent} event (types for the WebUI editor; ignored by CloudFront) */
async function handler(event) {
    const cookie = event.request.cookies[COOKIE];
    const read = cookie ? parseInt(cookie.value, 10) || 0 : 0;
    event.response.cookies[COOKIE] = { value: String(read + 1), attributes: 'Path=/; Max-Age=2592000; SameSite=Lax' };
    return event.response;
}
