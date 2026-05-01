function handler(event) {
    var request = event.request;
    var cookies = request.cookies;
    var uri = request.uri;

    // 1. Only run A/B logic for the main landing page
    // We don't want to rewrite style.css or images!
    if (uri === '/' || uri === '/index.html') {

        var bucket;

        // 2. Check for existing "ab_test_group" cookie
        if (cookies.ab_test_group) {
            bucket = cookies.ab_test_group.value;
        } else {
            // 3. Assignment: 50/50 split if cookie is missing
            bucket = Math.random() < 0.5 ? 'A' : 'B';

            // Log the new assignment to the CloudFrontize terminal
            console.log("New A/B Assignment: " + bucket);
        }

        // 4. Internal Rewrite based on the bucket
        if (bucket === 'A') {
            request.uri = '/original-page';
        } else {
            request.uri = '/test-page';
        }
        console.log("A/B ROUTE: " + uri + " -> " + request.uri);
    }

    return request;
}
