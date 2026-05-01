'use strict';

/**
 * CloudFrontize Exercise 2.3: The Cloaker
 * Hook: origin-response
 * This runs AFTER the origin server (S3, Express, etc.) has responded,
 * but BEFORE the result is cached by CloudFront or sent to the viewer.
 */
exports.hookType = 'origin-response';

exports.handler = async (event) => {
    // Access the response object returned by your backend
    const response = event.Records[0].cf.response;
    const headers = response.headers;

    // --- SECURITY CLEANUP ---
    // We remove these headers to hide our tech stack from attackers.

    // 1. Remove 'server' (e.g., "Apache/2.4.1" or "nginx")
    // This makes it harder for bots to target version-specific vulnerabilities.
    delete headers['server'];

    // 2. Remove 'x-powered-by' (e.g., "Express" or "PHP/8.0")
    // Prevents attackers from knowing which language/framework you are using.
    delete headers['x-powered-by'];
    console.log("[L@E: Cloaker] Stripping sensitive origin headers: server, x-powered-by");

    // Return the modified response to CloudFront
    return response;
};
