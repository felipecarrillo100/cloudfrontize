'use strict';

// A probe for this tutorial (Lambda@Edge, origin-response): reports request headers the origin
// received, as X-Origin-Saw-<name> response headers, so the checks can see them.
const NAMES = ['true-client-ip', 'x-cdn-processed'];

exports.handler = async (event) => {
    const { request, response } = event.Records[0].cf;
    for (const name of NAMES) {
        const h = request.headers[name];
        if (h) response.headers[`x-origin-saw-${name}`] = [{ value: h[0].value }];
    }
    return response;
};
