'use strict';

/**
 * 2.2 The Diplomat (origin-request)
 * Serves each visitor the site for their country, from /countries/<code>/.
 * CloudFront adds CloudFront-Viewer-Country after the viewer request event, so this has to run on
 * origin-request: a Lambda@Edge viewer-request function never sees CloudFront's value.
 */
exports.hookType = 'origin-request';

const COUNTRIES = ['FR', 'MX', 'US'];
const FALLBACK = 'US';

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    const header = request.headers['cloudfront-viewer-country'];
    const country = header ? header[0].value.toUpperCase() : FALLBACK;
    const folder = COUNTRIES.includes(country) ? country : FALLBACK;

    // S3 REST origins don't add index.html to folder requests
    const uri = request.uri.endsWith('/') ? `${request.uri}index.html` : request.uri;
    request.uri = `/countries/${folder}${uri}`;
    console.log(`[Diplomat] ${country} → ${request.uri}`);
    return request;
};
