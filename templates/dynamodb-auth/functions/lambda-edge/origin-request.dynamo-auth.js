'use strict';

// Members area (Lambda@Edge, origin-request): Basic credentials checked against the DynamoDB table
// "Users" ({ username, passwordHash: sha256 hex }). Locally the table is in LocalStack; in AWS,
// remove ENDPOINT and give the function's role dynamodb:GetItem on the table.
//
// The AWS SDK v3 is part of Lambda's Node.js runtimes (and of CloudFrontize): nothing to install.
const { DynamoDBClient, GetItemCommand } = require('@aws-sdk/client-dynamodb');
const crypto = require('crypto');

const ENDPOINT = 'http://localhost:4566'; // LocalStack (remove for AWS)
const db = new DynamoDBClient({
    region: 'us-east-1',
    ...(ENDPOINT ? { endpoint: ENDPOINT, credentials: { accessKeyId: 'test', secretAccessKey: 'test' } } : {}),
});

const unauthorized = {
    status: '401',
    statusDescription: 'Unauthorized',
    headers: { 'www-authenticate': [{ key: 'WWW-Authenticate', value: 'Basic realm="Members"' }] },
};

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    const header = request.headers.authorization?.[0]?.value ?? '';
    if (!header.startsWith('Basic ')) return unauthorized;

    const [username, password] = Buffer.from(header.slice(6), 'base64').toString('utf8').split(':');
    try {
        const { Item } = await db.send(new GetItemCommand({ TableName: 'Users', Key: { username: { S: username } } }));
        const hash = crypto.createHash('sha256').update(password ?? '').digest('hex');
        if (Item?.passwordHash?.S === hash) return request;
    } catch (err) {
        console.error('DynamoDB lookup failed:', err.message);
        return { status: '503', statusDescription: 'Service Unavailable', body: 'Authentication is unavailable' };
    }
    return unauthorized;
};
