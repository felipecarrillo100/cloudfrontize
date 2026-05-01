'use strict';

/**
 * CloudFrontize Exercise 3.3: The inspector
 * Hook: viewer-request
 * This runs BEFORE CloudFront checks the cache or contacts the origin.
 * Perfect for a "Firewall" since we can block traffic at the perimeter.
 */
exports.hookType = 'viewer-request';

exports.handler = async (event) => {
    // Access the request object from the CloudFront event
    const request = event.Records[0].cf.request;

    // Check if the body exists.
    // NOTE: In AWS, "Include Body" must be enabled in the Lambda association.
    if (request.body && request.body.data) {

        // Lambda@Edge bodies always arrive Base64 encoded.
        // We must convert the Buffer back to a UTF-8 string to inspect it.
        const bodyContent = Buffer.from(request.body.data, 'base64').toString();

        // Simple pattern matching for malicious content
        const isValid = !bodyContent.includes('DROP TABLE') && !bodyContent.includes('OR 1=1');
        console.log("[L@E: Inspector] Body Validation: " + (isValid ? "Safe" : "Threat Detected"));

        if (!isValid || bodyContent.includes('SQL-INJECTION')) {
            // Short-circuit: Return a response immediately.
            // This prevents the request from ever reaching your origin server.
            return {
                status: '403',
                statusDescription: 'Forbidden',
                body: 'Malicious request blocked by edge logic.'
            };
        }
    }

    // If no threats are found, return the request to let it continue to the origin.
    return request;
};
