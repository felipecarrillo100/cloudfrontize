// CloudFront Functions runtime 2.0 (see "runtime" in cloudfrontize.json): const, arrow functions
// and template literals are allowed here; in runtime 1.0 this would have to be ES 5.1.
const TRACKING_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

function handler(event) {
    const request = event.request;

    // Each query parameter is a key of request.querystring; deleting a key removes the parameter
    TRACKING_PARAMS.forEach((param) => delete request.querystring[param]);

    console.log(`Query normalized: ${request.uri}`);
    return request;
}
