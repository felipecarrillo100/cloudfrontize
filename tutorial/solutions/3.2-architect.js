'use strict';

/**
 * CloudFrontize Exercise 3.2: The Architect
 * Hook: viewer-request
 * This is the very first stage of the CloudFront lifecycle.
 * By returning a response here, we bypass the cache AND the origin entirely.
 */
exports.hookType = 'viewer-request';

exports.handler = async (event) => {
    // Instead of returning the 'request' object, we return a custom 'response'.
    // This is called "Short-Circuiting."
    return {
        // 503 is the standard status for maintenance (tells SEO bots to come back later)
        status: '503',
        statusDescription: 'Service Unavailable',

        // Headers must follow the Lambda@Edge format: an array of key/value objects
        headers: {
            'content-type': [{ key: 'Content-Type', value: 'text/html' }]
        },

        // The HTML body served directly from the Edge POP (Point of Presence)
        body: '<html><body><h1>Site Under Maintenance</h1><p>We will be back shortly.</p></body></html>'
    };
};
