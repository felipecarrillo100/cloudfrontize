'use strict';

/**
 * CloudFrontize Exercise 2.1: The Scientist
 * Hook: origin-request
 * Purpose: Internal URI Rewriting for A/B Testing.
 * Logic: Silently routes "Experiment" users to a subfolder without changing the URL in the browser.
 */

exports.hookType = 'origin-request';

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    const headers = request.headers;

    // 1. Identify Experiment Users
    // Check if the 'experiment=true' cookie exists in the high-fidelity header array.
    const hasExperiment = headers.cookie &&
        headers.cookie.some(c => c.value.includes('experiment=true'));

    if (hasExperiment) {
        /**
         * 2. REWRITE PREVENTION
         * If the user manually navigates to /experimental/ or if a relative path
         * in the HTML (like <a href="experimental/index.html">) triggers this again,
         * we avoid prefixing it a second time (e.g., /experimental/experimental/).
         */
        if (!request.uri.startsWith('/experimental/')) {
            const oldUri = request.uri;

            /**
             * 3. EXPLICIT OBJECT MAPPING
             * S3 Origins often fail on directory-style paths (/).
             * We explicitly map the root to index.html to ensure the S3 object is found.
             */
            const targetPath = (oldUri === '/') ? '/index.html' : oldUri;
            request.uri = `/experimental${targetPath}`;

            console.log(`⚡ Rewrite: ${oldUri} -> ${request.uri}`);
        }
    }

    return request;
};
