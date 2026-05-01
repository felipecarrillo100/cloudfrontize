function handler(event) {
    var request = event.request;
    var headers = request.headers;
    var uri = request.uri;

    // 1. PREVENT DOUBLE REWRITE (ES5 Way)
    // Check if the URI already contains '/countries/' at the start.
    // CFF does not support .startsWith(), so we use .indexOf() === 0
    if (uri.indexOf('/countries/') === 0) {
        return request;
    }

    // 2. Get the country
    var country = 'US';
    if (headers['cloudfront-viewer-country']) {
        country = headers['cloudfront-viewer-country'].value;
    }

    // 3. Perform the Rewrite
    var newUri = '/countries/' + country + uri;

    // 🛠️ URI Normalization (Step 2): Handle trailing slashes
    // CFF does not support .endsWith(), so we check the last character.
    // Why to do this? We manually append 'index.html' to paths ending in '/'
    // because S3 buckets in REST API mode do not automatically resolve directory indexes.
    // If your S3 bucket is configured for 'Static Website Hosting',
    // you can skip this block. Website mode automatically appends the Index Document
    // (e.g., index.html) to directory paths.
    if (newUri.charAt(newUri.length - 1) === '/') {
        newUri += 'index.html';
    }

    request.uri = newUri;

    // Debugging log (Visible in your cloudfrontize terminal)
    console.log("REWRITE 32: " + uri + " -> " + request.uri);

    return request;
}
