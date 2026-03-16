function handler(event) {
    var r = event.request;
    // CFF headers are objects with a .value property
    var ua = r.headers['user-agent'];

    // Check if the User-Agent header exists and contains the string 'bot'
    // Note: includes() is available in the CFF runtime (ES 5.1+)
    if (ua && ua.value.toLowerCase().indexOf('bot') !== -1) {
        return {
            statusCode: 403,
            statusDescription: 'Bot Blocked',
            headers: {
                'content-type': { value: 'text/plain' }
            }
        };
    }

    // Allow legitimate traffic to proceed
    return r;
}
