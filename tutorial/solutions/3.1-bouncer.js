'use strict';

/**
 * CloudFrontize Exercise 3.1: The Bouncer
 * Hook: viewer-request
 * We use this hook to intercept the request BEFORE CloudFront checks the cache.
 * This ensures that even cached content is protected by the password.
 */
exports.hookType = 'viewer-request';

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    const headers = request.headers;

    // 🔐 Hardcoded credentials (for demonstration/simple staging sites)
    const user = 'admin';
    const pass = 'password';

    /**
     * 🛠️ The Encoding Pipeline:
     * Basic Auth expects the header: "Authorization: Basic <base64-string>"
     */
    const credentials = Buffer.from(`${user}:${pass}`).toString('base64');
    const expectedAuth = `Basic ${credentials}`;

    // Extract the 'Authorization' header sent by the browser
    const authHeader = headers.authorization ? headers.authorization[0].value : null;

    // 🛡️ Challenge Logic
    if (authHeader !== expectedAuth) {
        console.log("[L@E: Bouncer] Auth Failed");
        /**
         * If the password is wrong or missing, we "Short-Circuit" the request.
         * Returning a 401 status triggers the browser's native login popup.
         */
        return {
            status: '401',
            statusDescription: 'Unauthorized',
            headers: {
                // The 'www-authenticate' header is what tells the browser to show the login box.
                'www-authenticate': [{ key: 'WWW-Authenticate', value: 'Basic' }]
            },
            body: '<h1>401 Unauthorized: Access Denied from Lambda@Edge</h1>'
        };
    }

    // ✅ Access granted!
    console.log("[L@E: Bouncer] Auth Passed");
    // Returning the request object tells CloudFront to proceed to the cache or origin.
    return request;
};
