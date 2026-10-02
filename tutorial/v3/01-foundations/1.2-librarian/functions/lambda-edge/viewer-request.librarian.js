'use strict';

/**
 * 1.2 The Librarian (Lambda@Edge, viewer-request)
 * Sorts the query string before CloudFront looks in its cache, so /page?b=2&a=1 and /page?a=1&b=2
 * share one cached copy.
 */
exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    if (!request.querystring) return request;

    // URLSearchParams parses "z=9&a=1"; sort() orders the parameters by name, every time
    const params = new URLSearchParams(request.querystring);
    params.sort();
    request.querystring = params.toString();
    console.log(`[Librarian] Normalized query: ${request.querystring}`);
    return request;
};
