function handler(event) {
    var r = event.request;
    var count = r.headers['x-request-count'];
    if (count && parseInt(count.value) > 100) {
        console.log('Rate Limit Blocked: ' + count.value);
        return {statusCode: 429, statusDescription: 'Too Many Requests'};
    }
    return r;
}
