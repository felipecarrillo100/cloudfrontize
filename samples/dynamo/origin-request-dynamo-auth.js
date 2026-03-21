'use strict';

const { DynamoDB } = require("@aws-sdk/client-dynamodb");
const { SecretsManager } = require("@aws-sdk/client-secrets-manager");

/**
 * CloudFrontize Sample: DynamoDB + Secrets Manager Auth (origin-request)
 * 
 * This sample demonstrates how to use the AWS SDK v3 to perform an 
 * external authentication check against DynamoDB, while retrieving 
 * database secrets from Secrets Manager—all within a local simulation.
 * 
 * NOTE: Requires LocalStack running at http://localhost:4566 and the 
 * --allow-networking flag enabled in cloudfrontize.
 */

// MANDATORY: Tells CloudFrontize which trigger point to simulate
exports.hookType = 'origin-request';

// LocalStack configuration (Pre-configured for the tutorial/sample environment)
const LOCALSTACK_ENDPOINT = "http://localhost:4566";
const AWS_CONFIG = {
    endpoint: LOCALSTACK_ENDPOINT,
    region: "us-east-1",
    credentials: {
        accessKeyId: "test",
        secretAccessKey: "test",
    },
};

// Initialize clients
const dynamoDb = new DynamoDB(AWS_CONFIG);
const secretsManager = new SecretsManager(AWS_CONFIG);

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    const headers = request.headers;

    console.log(`[Auth] Intercepting request for ${request.uri}`);

    // 1. Extract Basic Auth Header
    if (!headers.authorization) {
        return getUnauthorizedResponse();
    }

    try {
        const authValue = headers.authorization[0].value;
        const encoded = authValue.split(' ')[1];
        const [username, password] = Buffer.from(encoded, 'base64').toString('utf8').split(':');

        console.log(`[Auth] Attempting login for user: ${username}`);

        // 2. Fetch User from DynamoDB
        // Fidelity: AWS SDK v3 is fully supported in origin hooks.
        const userResult = await dynamoDb.getItem({
            TableName: "Users",
            Key: { username: { S: username } },
        });

        if (!userResult.Item) {
            console.warn(`[Auth] User ${username} not found in DynamoDB.`);
            return getUnauthorizedResponse();
        }

        // 3. (Optional Demo) Fetch DB Secrets from Secrets Manager
        // This simulates a real-world scenario where the Edge needs to know DB creds.
        const dbSecret = await secretsManager.getSecretValue({ SecretId: "MyDBCredentials" });
        console.log(`[Auth] Successfully retrieved MyDBCredentials from Secrets Manager.`);

        // 4. Verify Password (Fidelity: Using standard comparison)
        const storedPassword = userResult.Item.password.S;
        if (storedPassword !== password) {
            console.warn(`[Auth] Invalid password for user: ${username}`);
            return getUnauthorizedResponse();
        }

        console.log(`[Auth] ✅ Authentication successful for ${username}.`);
        
        // Inject a custom header to show the origin that the user is authenticated
        request.headers['x-authenticated-user'] = [{
            key: 'X-Authenticated-User',
            value: username
        }];

        return request;

    } catch (err) {
        console.error(`[Auth] 🛑 Integration Error: ${err.message}`);
        return {
            status: '502',
            statusDescription: 'Bad Gateway',
            body: `Integration Error with Edge Services: ${err.message}`,
            headers: { 'content-type': [{ key: 'Content-Type', value: 'text/plain' }] }
        };
    }
};

/**
 * Utility to generate a standard 401 response
 */
function getUnauthorizedResponse() {
    return {
        status: '401',
        statusDescription: 'Unauthorized',
        body: 'Unauthorized: Missing or invalid credentials.',
        headers: {
            'www-authenticate': [{ key: 'WWW-Authenticate', value: 'Basic realm="Secure CloudFrontize Area"' }],
            'content-type': [{ key: 'Content-Type', value: 'text/plain' }]
        }
    };
}
