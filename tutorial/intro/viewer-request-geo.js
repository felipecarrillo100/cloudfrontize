exports.hookType = 'viewer-request';

exports.handler = (event, context, callback) => {
    const request = event.Records[0].cf.request;
    const headers = request.headers;

    const country = headers['cloudfront-viewer-country']?.[0]?.value || 'US';

    console.log("Viewer country:", country);

    if (country === 'FR') {
        console.log("Rewriting to French page");
        request.uri = '/index-fr.html';
    } else {
        console.log("Serving default page");
    }

    callback(null, request);
};
