'use strict';

// A probe for this tutorial: reports the query string the request ended with, in X-Query.
exports.handler = async (event) => {
    const { request, response } = event.Records[0].cf;
    response.headers['x-query'] = [{ key: 'X-Query', value: request.querystring }];
    return response;
};
