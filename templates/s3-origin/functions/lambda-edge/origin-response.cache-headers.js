'use strict';

// Cache headers (Lambda@Edge, origin-response): S3 objects often have no Cache-Control.
// This sets one by type: long for fingerprinted assets, short for HTML. Runs on cache misses only,
// and what it returns is what CloudFront caches.

exports.handler = async (event) => {
    const { request, response } = event.Records[0].cf;
    if (response.headers['cache-control']) return response;

    const longLived = /\.(js|css|woff2?|png|jpe?g|svg|webp)$/.test(request.uri);
    response.headers['cache-control'] = [{
        key: 'Cache-Control',
        value: longLived ? 'public, max-age=31536000, immutable' : 'public, max-age=60',
    }];
    return response;
};
