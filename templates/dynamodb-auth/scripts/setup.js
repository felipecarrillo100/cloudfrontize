'use strict';
// Creates the "Users" table in LocalStack with the demo user alice / wonderland.
// Run from the project folder: node scripts/setup.js (uses CloudFrontize's AWS SDK if it isn't installed here)
const path = require('path');
let sdk;
try { sdk = require('@aws-sdk/client-dynamodb'); } catch {
    sdk = require(require.resolve('@aws-sdk/client-dynamodb', { paths: [path.dirname(require.resolve('cloudfrontize/package.json'))] }));
}
const { DynamoDBClient, CreateTableCommand, PutItemCommand, waitUntilTableExists } = sdk;
const crypto = require('crypto');

const db = new DynamoDBClient({ region: 'us-east-1', endpoint: 'http://localhost:4566', credentials: { accessKeyId: 'test', secretAccessKey: 'test' } });

(async () => {
    try {
        await db.send(new CreateTableCommand({
            TableName: 'Users',
            AttributeDefinitions: [{ AttributeName: 'username', AttributeType: 'S' }],
            KeySchema: [{ AttributeName: 'username', KeyType: 'HASH' }],
            BillingMode: 'PAY_PER_REQUEST',
        }));
        await waitUntilTableExists({ client: db, maxWaitTime: 30 }, { TableName: 'Users' });
    } catch (err) {
        if (err.name !== 'ResourceInUseException') throw err;
    }
    const passwordHash = crypto.createHash('sha256').update('wonderland').digest('hex');
    await db.send(new PutItemCommand({ TableName: 'Users', Item: { username: { S: 'alice' }, passwordHash: { S: passwordHash } } }));
    console.log('Table "Users" ready, with alice / wonderland');
})().catch(err => { console.error(err.message); process.exit(1); });
