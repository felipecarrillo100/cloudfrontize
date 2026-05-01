function handler(event) {
    var r = event.request;
    // Check if URI exactly matches the promo path
    if (r.uri === '/promo') {
        // Return 301 redirect response immediately
        return {
            statusCode: 301,
            statusDescription: 'Moved Permanently',
            headers: {
                location: { value: '/summer-sale' }
            }
        };
    }
    // Allow other requests to proceed to cache/origin
    return r;
}
