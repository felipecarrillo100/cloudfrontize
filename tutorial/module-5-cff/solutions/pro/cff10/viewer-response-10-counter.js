function handler(event) {
    var request = event.request;
    var response = event.response;
    var cookies = request.cookies || {}; // Fallback for safety

    console.log("--- Counter Hook Triggered ---");

    var count = 0;
    if (cookies['client-request-count'] && cookies['client-request-count'].value) {
        count = parseInt(cookies['client-request-count'].value);
        console.log("Detected existing cookie count: " + count);
    } else {
        console.log("No 'client-request-count' cookie found in request.");
    }

    // Increment logic
    var newCount = count + 1;
    console.log("[CFF: Counter] Set-Cookie: count=" + newCount);

    // Set the cookie
    response.cookies['client-request-count'] = {
        value: newCount.toString(),
        attributes: "Path=/; Max-Age=300"
    };

    return response;
}
