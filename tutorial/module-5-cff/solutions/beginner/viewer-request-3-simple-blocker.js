function handler(event) {
    var r = event.request;
    // Block any request path beginning with /admin
    if (r.uri.indexOf('/admin') === 0) {
        // Return 403 Forbidden to stop the request at the edge
        return {
            statusCode: 403,
            statusDescription: 'Forbidden'
        };
    }
    // Allow non-admin traffic to proceed
    return r;
}
