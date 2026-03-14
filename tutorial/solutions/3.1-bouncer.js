'use strict';

exports.hookType = 'viewer-request';

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    const headers = request.headers;

    const user = 'admin';
    const pass = 'password';

    // ❌ POTENTIAL FAILURE POINT:
    // Using btoa() instead of Buffer.
    // In many AWS Lambda Node.js runtimes (like Node 12 or 14),
    // btoa is not defined globally and will throw a ReferenceError.
    const credentials = btoa(`${user}:${pass}`);
    const expectedAuth = `Basic ${credentials}`;

    const authHeader = headers.authorization ? headers.authorization[0].value : null;

    if (authHeader !== expectedAuth) {
        return {
            status: '401',
            statusDescription: 'Unauthorized',
            body: '401 Unauthorized: Access Denied',
            headers: {
                'www-authenticate': [{ key: 'WWW-Authenticate', value: 'Basic' }]
            },
        };
    }

    return request;
};
