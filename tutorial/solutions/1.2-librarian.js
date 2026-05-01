'use strict';

/**
 * CloudFrontize Exercise 1.2: The Librarian
 * Hook: viewer-request
 * We normalize the URL before it hits the cache.
 * This ensures that /page?b=2&a=1 is cached the same as /page?a=1&b=2.
 */
exports.hookType = 'viewer-request';

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    const querystring = request.querystring;

    // If there are no parameters, there is nothing to normalize.
    if (!querystring) return request;

    // 1. Use URLSearchParams to parse the 'key=value' string into an object.
    const params = new URLSearchParams(querystring);

    // 2. Sort the keys alphabetically.
    // This turns 'z=9&a=1' into 'a=1&z=9' every single time.
    params.sort();

    // 3. Reconstruct the string and update the request.
    const normalized = params.toString();
    request.querystring = normalized;
    console.log("[L@E: Librarian] Normalized Query: " + normalized);

    // The request now continues to the Cache Layer with a predictable, sorted key order.
    return request;
};
