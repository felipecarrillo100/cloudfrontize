function handler(event) {
    var request = event.request;
    var cookies = request.cookies || {}; // Safety fallback
    var limit = 5;

    console.log("--- Guard Hook Triggered ---");
    console.log("URI: " + request.uri);

    var count = 0;
    if (cookies['client-request-count'] && cookies['client-request-count'].value) {
        count = parseInt(cookies['client-request-count'].value);
        console.log("Guard detected cookie count: " + count);
    } else {
        console.log("Guard: No rate-limit cookie found in request.");
    }

    if (count >= limit) {
        console.log("[CFF: Guard] Blocked: count " + count);
        return {
            statusCode: 429,
            statusDescription: 'Too Many Requests',
            body: 'Rate limit reached! Your cookie count is ' + count
        };
    }

    console.log("[CFF: Guard] Passed: count " + count);
    return request;
}
