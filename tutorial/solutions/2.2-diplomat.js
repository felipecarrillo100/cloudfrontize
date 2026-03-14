'use strict';

/**
 * CloudFrontize Exercise 2.2: The Diplomat
 * Hook: origin-request
 * This runs AFTER a cache miss, just before CloudFront talks to your backend.
 * We use this to "remap" the file path based on user data.
 */
exports.hookType = 'origin-request';

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    const headers = request.headers;

    // 🌍 Extract the country code provided by CloudFront's Geo-IP detection.
    // CloudFront adds this header automatically if enabled in the distribution.
    // We default to 'US' if the header is missing.
    const country = (headers['cloudfront-viewer-country'] &&
        headers['cloudfront-viewer-country'][0].value) || 'US';

    // 🛣️ URI Rewriting:
    // If the user requests '/index.html' from France (FR),
    // the backend will actually see a request for '/countries/FR/index.html'.
    request.uri = `/countries/${country}${request.uri}`;

    // Return the modified request to tell CloudFront where to fetch the file.
    return request;
};
