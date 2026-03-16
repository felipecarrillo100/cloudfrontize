function handler(event) {
    var request = event.request;
    var headers = request.headers;
    var uri = request.uri;

    // 1. Get the country (Default to 'US' like your inspiration)
    var country = 'US';
    if (headers['cloudfront-viewer-country']) {
        country = headers['cloudfront-viewer-country'].value;
    }

    // 2. Asset Protection Gate
    // We only want to rewrite "Page" requests (the root or .html files).
    // If we rewrite style.css to /countries/FR/style.css, it will 404!
    var isRoot = (uri === '/' || uri === '/index.html');
    var isHtml = uri.indexOf('.html') !== -1;

    if (isRoot || isHtml) {
        // Normalize the URI for the join
        var path = (uri === '/') ? '/index.html' : uri;

        // 3. The "Diplomat" Rewrite
        // e.g., /index.html -> /countries/FR/index.html
        request.uri = '/countries/' + country + path;

        // Debugging log (Visible in your cloudfrontize terminal)
        console.log("REWRITE: " + uri + " -> " + request.uri);
    }

    return request;
}
