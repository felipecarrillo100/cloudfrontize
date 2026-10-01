'use strict';

/**
 * 2.3 The Cloaker (Lambda@Edge, origin-response)
 * Removes the headers that reveal the origin's software and versions, before CloudFront caches
 * the response.
 */
const REVEALING = ['server', 'x-powered-by', 'x-aspnet-version', 'x-aspnetmvc-version'];

exports.handler = async (event) => {
    const response = event.Records[0].cf.response;
    for (const name of REVEALING) delete response.headers[name];
    return response;
};
