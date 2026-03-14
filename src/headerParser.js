'use strict';

const fs = require('fs');
const path = require('path'); // Added for cleaner path logging

class HeaderParser {
    constructor() {
        this.REQUEST_KEY = 'requestheaders';
        this.RESPONSE_KEY = 'responseheaders';
    }

    /**
     * Parses the headers file and separates them into two string-only buckets.
     * @param {string} headersPath
     * @returns {{requestHeaders: Object, responseHeaders: Object}}
     */
    parse(headersPath) {
        let requestHeaders = {};
        let responseHeaders = {};

        if (!headersPath || !fs.existsSync(headersPath)) {
            return { requestHeaders, responseHeaders };
        }

        // --- NEW: Log the filename when provided ---
        console.log(`[CloudFrontize] Loading headers from: (${path.basename(headersPath)})`);

        let rawData;
        try {
            rawData = JSON.parse(fs.readFileSync(headersPath, 'utf8'));
        } catch (err) {
            console.error(`🛑 JSON Parse Error in ${headersPath}: ${err.message}`);
            process.exit(1);
        }

        const keys = Object.keys(rawData);
        const lowerKeys = keys.map(k => k.toLowerCase());

        // 1. Audit: Check for duplicate case-insensitive reserved keys
        const reqCount = lowerKeys.filter(k => k === this.REQUEST_KEY).length;
        const resCount = lowerKeys.filter(k => k === this.RESPONSE_KEY).length;

        if (reqCount > 1 || resCount > 1) {
            console.error(`🛑 Ambiguity Error: Multiple versions of "${this.REQUEST_KEY}" or "${this.RESPONSE_KEY}" found in ${headersPath}.`);
            process.exit(1);
        }

        // 2. Audit: Mode Detection
        let explicitReq = null;
        let explicitRes = null;

        for (const key of keys) {
            const lowerKey = key.toLowerCase();
            const value = rawData[key];

            if (lowerKey === this.REQUEST_KEY) {
                if (typeof value !== 'object' || Array.isArray(value) || value === null) {
                    console.error(`🛑 Validation Error: "${key}" must be an object.`);
                    process.exit(1);
                }
                explicitReq = value;
            } else if (lowerKey === this.RESPONSE_KEY) {
                if (typeof value !== 'object' || Array.isArray(value) || value === null) {
                    console.error(`🛑 Validation Error: "${key}" must be an object.`);
                    process.exit(1);
                }
                explicitRes = value;
            }
        }

        // 3. Separation logic
        if (explicitReq || explicitRes) {
            requestHeaders = explicitReq || {};
            responseHeaders = explicitRes || {};
        } else {
            // Flat mode: fallback to treating all top-level as request
            requestHeaders = { ...rawData };
        }

        // 4. Audit: Strict String Validation
        this._validateStrings(requestHeaders, 'RequestHeaders', headersPath);
        this._validateStrings(responseHeaders, 'ResponseHeaders', headersPath);

        return { requestHeaders, responseHeaders };
    }

    _validateStrings(obj, context, path) {
        for (const [key, value] of Object.entries(obj)) {
            if (typeof value !== 'string') {
                console.error(`🛑 Type Error in ${path}: [${context}] Header "${key}" must be a string. Arrays/Objects are not allowed at this stage.`);
                process.exit(1);
            }
        }
    }
}

module.exports = { HeaderParser };
