'use strict';

exports.hookType = 'viewer-request';

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    const headers = request.headers;

    // 🔐 Credentials Setup
    const user = 'admin';
    const pass = 'password';

    // 🛠️ The Encoding Pipeline:
    // 1. Create the string "user:password"
    // 2. Convert it to a Buffer (Avoid using 'btoa()'. Not available in Lannda@Edge functions)
    // 3. Encode that Buffer to 'base64'
    const credentials = Buffer.from(`${user}:${pass}`).toString('base64');
    const expectedAuth = `Basic ${credentials}`;

    const authHeader = headers.authorization ? headers.authorization[0].value : null;

    if (authHeader !== expectedAuth) {
        // Stop the request and return a 401 Unauthorized immediately
        return {
            status: '401',
            statusDescription: 'Unauthorized',
            headers: {
                'www-authenticate': [{ key: 'WWW-Authenticate', value: 'Basic' }]
            },
            body: '<h1>401 Unauthorized: Access Denied from Lambda@Edge</h1>'
        };
    }

    return request; // Access granted!
};
