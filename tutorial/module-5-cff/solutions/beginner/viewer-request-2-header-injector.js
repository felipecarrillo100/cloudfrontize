function handler(event) {
    var r = event.request;
    // Inject a custom header to be sent to the origin
    r.headers['x-demo'] = { value: 'cloudfrontize' };
    // Return modified request to continue the lifecycle
    console.log('Header Injected: x-demo' )
    return r;
}
