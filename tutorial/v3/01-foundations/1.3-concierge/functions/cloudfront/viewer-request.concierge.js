// 1.3 The Concierge (CloudFront Function, runtime 2.0, viewer-request)
// Sends phones to the mobile site before the request reaches the cache or the origin.
// CloudFront Functions can read CloudFront's device headers; a Lambda@Edge viewer-request
// function can't, because CloudFront adds them after the viewer request event.
const MOBILE_SITE = 'https://m.example.com';

function toQueryString(querystring) {
    const parts = [];
    Object.keys(querystring).forEach((name) => {
        const field = querystring[name];
        const values = field.multiValue ? field.multiValue.map((v) => v.value) : [field.value];
        values.forEach((value) => parts.push(value === '' ? name : `${name}=${value}`));
    });
    return parts.length ? `?${parts.join('&')}` : '';
}

async function handler(event) {
    const request = event.request;
    const mobile = request.headers['cloudfront-is-mobile-viewer'];

    if (mobile && mobile.value === 'true') {
        const location = `${MOBILE_SITE}${request.uri}${toQueryString(request.querystring)}`;
        console.log(`[Concierge] mobile viewer → ${location}`);
        return {
            statusCode: 302,
            statusDescription: 'Found',
            headers: { location: { value: location } }
        };
    }
    return request;
}
