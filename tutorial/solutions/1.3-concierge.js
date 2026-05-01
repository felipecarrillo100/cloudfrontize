'use strict';

/**
 * CloudFrontize Exercise 1.3: The Concierge
 * Hook: viewer-request
 * We intercept the request immediately at the Edge to avoid
 * loading the desktop version for mobile users.
 */
exports.hookType = 'viewer-request';

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    const headers = request.headers;

    // 📱 CloudFront analyzes the User-Agent and injects these 'is-device' headers.
    // Ensure 'CloudFront-Is-Mobile-Viewer' is whitelisted in your distribution settings.
    const isMobile = headers['cloudfront-is-mobile-viewer'] &&
        headers['cloudfront-is-mobile-viewer'][0].value === 'true';

    if (isMobile) {
        // Reconstruct the query string (e.g., ?id=123) to ensure deep links don't break.
        const qs = request.querystring ? '?' + request.querystring : '';

        // Build the mobile-specific URL while preserving the path (URI).
        const destination = `https://m.example.com${request.uri}${qs}`;

        // 4. Return the redirect response
        console.log("[L@E: Concierge] Mobile Redirect: " + destination);

        // 🚀 Redirect: Return a 302 to the browser immediately.
        // This prevents the request from reaching the desktop origin entirely.
        return {
            status: '302',
            statusDescription: 'Found',
            headers: {
                location: [{ key: 'Location', value: destination }]
            }
        };
    }

    // Continue to the original request (Desktop/Tablet/Other)
    return request;
};
