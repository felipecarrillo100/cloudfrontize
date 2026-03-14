'use strict';

exports.hookType = 'origin-response';

exports.handler = async (event) => {
    const response = event.Records[0].cf.response;
    const headers = response.headers;

    // You can comment to see the before and after
    // console.log('Headers before cleanup:', JSON.stringify(headers, null, 2));
    delete headers['server'];
    delete headers['x-powered-by'];
    // console.log('Headers after cleanup:', JSON.stringify(headers, null, 2));

    return response;
};
