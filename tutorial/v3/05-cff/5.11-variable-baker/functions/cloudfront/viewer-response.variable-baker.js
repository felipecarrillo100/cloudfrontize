// 5.11 The Variable Baker (CloudFront Function, runtime 2.0, viewer-response)
// The Content-Security-Policy differs per environment: relaxed locally (the dev server's live
// reload), strict in production. CloudFront Functions have no environment variables, so the policy
// is baked in at build time: __CSP__ is replaced from the bake file.
// Double quotes: the policy itself contains single quotes ('self'), and baking replaces text as is.

const CSP = "__CSP__";

/** @param {CloudFrontFunctionEvent} event (types for the WebUI editor; ignored by CloudFront) */
async function handler(event) {
    event.response.headers['content-security-policy'] = { value: CSP };
    return event.response;
}
