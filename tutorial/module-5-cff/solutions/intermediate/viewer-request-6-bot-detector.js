function handler(event) {
    var r = event.request;
    // CFF headers are objects with a .value property
    var ua = r.headers['user-agent'];

    if (ua) {
        var lowerUA = ua.value.toLowerCase();
        if (lowerUA.indexOf('bot') !== -1 || lowerUA.indexOf('spider') !== -1 || lowerUA.indexOf('crawler') !== -1) {
            console.log('Bot Blocked: ' + ua.value);
            return {
                statusCode: 403,
                statusDescription: 'Bot Blocked',
                headers: {
                    'content-type': { value: 'text/plain' }
                }
            };
        }
    }

    // Allow legitimate traffic to proceed
    return r;
}
