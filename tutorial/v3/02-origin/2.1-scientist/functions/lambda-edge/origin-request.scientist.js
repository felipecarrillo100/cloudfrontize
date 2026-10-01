'use strict';

/**
 * 2.1 The Scientist (Lambda@Edge, origin-request)
 * Visitors with the cookie experiment=true get the experimental version of the site, from
 * /experimental/ in the origin. The URL in their browser doesn't change (an internal rewrite).
 */
exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    const cookies = request.headers.cookie ?? [];
    const inExperiment = cookies.some(c => c.value.split(';').some(pair => pair.trim() === 'experiment=true'));

    // Don't prefix twice when a page links into /experimental/ itself
    if (inExperiment && !request.uri.startsWith('/experimental/')) {
        // S3 REST origins don't add index.html to folder requests
        const uri = request.uri.endsWith('/') ? `${request.uri}index.html` : request.uri;
        request.uri = `/experimental${uri}`;
        console.log(`[Scientist] Rewrote to ${request.uri}`);
    }
    return request;
};
