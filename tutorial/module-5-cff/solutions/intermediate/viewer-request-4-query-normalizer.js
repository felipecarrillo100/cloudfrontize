function handler(event) {
    var request = event.request;
    var querystring = request.querystring;

    // Define the list of tracking parameters to remove
    var trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

    // 1. Iterate through the parameters and delete those found in the tracking list
    for (var i = 0; i < trackingParams.length; i++) {
        var param = trackingParams[i];
        if (querystring[param]) {
            delete querystring[param];
        }
    }

    // 2. The "Receipt": Print the final state to the emulator terminal
    // Use JSON.stringify so you can see the full object structure
    // console.log("CFF_OUT: " + JSON.stringify(request.querystring));

    // Return the modified request with the cleaned query string
    return request;
}
