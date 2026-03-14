'use strict';

/**
 * CloudFrontize Exercise 4.1: The baker
 * Hook: viewer-request
 * We use this to tag the request with the correct API endpoint
 * before it reaches the origin or cache.
 */
exports.hookType = 'viewer-request';

// 🍞 BAKE PLACEHOLDER:
// This string is intended to be replaced during the build/deployment process.
const API_ENDPOINT = "__API_ENDPOINT__";

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;

    /**
     * 🛠️ Variable Resolution:
     * We check if the placeholder was successfully swapped.
     * If not (e.g., during local dev), we fallback to a local URL.
     */
    const api = (typeof API_ENDPOINT !== 'undefined' && API_ENDPOINT !== "__API_ENDPOINT__")
        ? API_ENDPOINT
        : 'http://localhost:8080';

    // Logs appear in the emulator terminal or CloudWatch Logs in production.
    console.log(`[Production] Connecting to: ${api}`);

    // 🏷️ Header Injection:
    // We pass the "baked" value to the origin so the backend knows which API it's tied to.
    request.headers['x-baked-end-point'] = [{ key: 'X-Baked-End-Point', value: api }];

    return request;
};
