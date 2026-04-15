"use strict";

exports.handler = async (event) => {
    const response = event.Records[0].cf.response;
    response.headers['x-custom-header'] = [{
        key: 'X-Custom-Header',
        value: 'Cloudfrontize-Test',
    }];
    return response;
};
