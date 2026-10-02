'use strict';

/**
 * Intro (Lambda@Edge, origin-request): French visitors get the French page.
 * CloudFront tells functions where the viewer is with the CloudFront-Viewer-Country header.
 * It adds it after the viewer request event, so Lambda@Edge reads it on origin-request.
 */
exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    const header = request.headers['cloudfront-viewer-country'];
    const country = header ? header[0].value : 'US';
    console.log(`Viewer country: ${country}`);

    if (country === 'FR' && (request.uri === '/' || request.uri === '/index.html')) {
        console.log('Rewriting to the French page');
        request.uri = '/index-fr.html';
    }
    return request;
};
