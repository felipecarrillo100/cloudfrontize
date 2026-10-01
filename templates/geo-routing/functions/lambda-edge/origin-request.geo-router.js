'use strict';

// Geo routing (Lambda@Edge, origin-request): each country gets its language's version of the site,
// from /<language>/ in the origin. The viewer still sees the URL they asked for.
//
// It runs on origin-request because CloudFront adds CloudFront-Viewer-Country after the viewer
// request event: a Lambda@Edge viewer-request function never sees CloudFront's value.

const LANGUAGES = { FR: 'fr', BE: 'fr', DE: 'de', AT: 'de', ES: 'es', MX: 'es', AR: 'es' };
const DEFAULT_LANGUAGE = 'en';

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    const header = request.headers['cloudfront-viewer-country'];
    const country = header ? header[0].value.toUpperCase() : '';
    const language = LANGUAGES[country] ?? DEFAULT_LANGUAGE;

    // S3 REST origins don't add index.html to folder requests
    const uri = request.uri.endsWith('/') ? `${request.uri}index.html` : request.uri;
    request.uri = `/${language}${uri}`;
    return request;
};
