'use strict';

// A probe for this tutorial only: reports the query string the origin actually received.
// The origin-response event includes the request CloudFront sent to the origin.
exports.handler = async (event) => {
    const { request, response } = event.Records[0].cf;
    response.headers['x-origin-query'] = [{ key: 'X-Origin-Query', value: request.querystring || '(none)' }];
    return response;
};
