// 5.2 The Header Injector (CloudFront Function, runtime 2.0, viewer-request)
// Tells the origin who the real visitor is: CloudFront connects to the origin itself, so without
// this the origin only sees CloudFront's address.

/** @param {CloudFrontFunctionEvent} event (types for the WebUI editor; ignored by CloudFront) */
async function handler(event) {
    const request = event.request;
    request.headers['true-client-ip'] = { value: event.viewer.ip };
    request.headers['x-cdn-processed'] = { value: 'true' };
    return request;
}
