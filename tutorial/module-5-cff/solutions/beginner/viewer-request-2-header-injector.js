function handler(event) {
    var r = event.request;
    // Inject a custom header to be sent to the origin
    r.headers['x-edge-powered-by'] = { value: 'cloudfrontize' };
    // Return modified request to continue the lifecycle
    console.log('Header Injected: x-edge-powered-by')
    return r;
}
