function handler(event) {
    var request = event.request;
    var headers = request.headers;

    // 1. Define the Security Policy
    // Note: CFF requires headers to be lowercase keys with a { value: "..." } object.
    var securityHeaders = {
        'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Content-Security-Policy': "default-src 'self'",
        'Referrer-Policy': 'same-origin'
    };

    // 2. Inject the headers
    // We use a simple loop to apply the securityHeaders to the request object.
    for (var key in securityHeaders) {
        if (Object.prototype.hasOwnProperty.call(securityHeaders, key)) {
            var cloudFrontKey = key.toLowerCase();
            headers[cloudFrontKey] = { value: securityHeaders[key] };
        }
    }

    // 3. The "Receipt": Log the enforcement
    console.log('Security Policy Enforced: ' + request.uri);

    // 4. Return the modified request to the origin
    return request;
}
