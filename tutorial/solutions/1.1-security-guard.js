'use strict';

/**
 * CloudFrontize Exercise 1.1: The Security Guard
 * Hook: viewer-response
 * This runs AFTER the cache/origin has provided a response, but BEFORE it reaches the user.
 * Using this hook ensures these headers are present even on cached content.
 * HINT: Notice Cloud Front Functions use headers in a particular way
 */
exports.hookType = 'viewer-response';

exports.handler = async (event) => {
    const response = event.Records[0].cf.response;
    const headers = response.headers;

    // 🔒 HSTS (Strict-Transport-Security)
    // Tells the browser to ONLY communicate with this site over HTTPS for the next 2 years.
    // This prevents SSL stripping attacks.
    headers['strict-transport-security'] = [{
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload'
    }];

    // 🛡️ X-Content-Type-Options
    // Prevents the browser from "MIME-sniffing" a response away from the declared content-type.
    // This stops browsers from executing a .txt file as if it were a .js file (Cross-Site Scripting).
    headers['x-content-type-options'] = [{
        key: 'X-Content-Type-Options',
        value: 'nosniff'
    }];

    // Return the hardened response to the viewer
    return response;
};
