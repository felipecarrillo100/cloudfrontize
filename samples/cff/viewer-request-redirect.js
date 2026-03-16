function handler(event) {
    var request = event.request;
    var uri = request.uri;

    // Direct response (short-circuits the pipeline)
    if (uri === '/promo') {
        return {
            statusCode: 301,
            statusDescription: 'Moved Permanently',
            headers: {
                'location': { value: '/summer-sale' }
            }
        };
    }

    return request;
}
