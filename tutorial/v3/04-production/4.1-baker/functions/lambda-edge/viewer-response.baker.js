'use strict';

/**
 * 4.1 The Baker (Lambda@Edge, viewer-response)
 * Lambda@Edge has no environment variables of its own, so configuration is "baked" into the code:
 * __API_ENDPOINT__ is replaced with a value from the bake file, locally and when building for
 * deployment. The page gets the endpoint in X-Api-Endpoint (and in a real site, in its HTML).
 */
const API_ENDPOINT = '__API_ENDPOINT__';

exports.handler = async (event) => {
    const response = event.Records[0].cf.response;
    response.headers['x-api-endpoint'] = [{ key: 'X-Api-Endpoint', value: API_ENDPOINT }];
    return response;
};
