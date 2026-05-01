function handler(event) {
    var request = event.request;
    var uri = request.uri;

    // 1. IDEMPOTENCY GUARD: Don't rewrite if already localized
    // This allows relative assets and cross-country links to work.
    if (uri.indexOf('/countries/') === 0) {
        return request;
    }

    // 2. COUNTRY RESOLUTION: Use CloudFront headers (default to 'US')
    var country = 'US';
    if (request.headers['cloudfront-viewer-country']) {
        country = request.headers['cloudfront-viewer-country'].value;
    }

    // 3. THE INTERNAL PIVOT: Rewrite the URI to the localized folder
    var newUri = '/countries/' + country + uri;

    // 🛠️ S3 INDEX FIX: Ensure directory paths resolve to index.html
    if (newUri.charAt(newUri.length - 1) === '/') {
        newUri += 'index.html';
    }

    request.uri = newUri;
    console.log("[Geo-Router] " + country + ": " + uri + " -> " + request.uri);

    return request;
}
