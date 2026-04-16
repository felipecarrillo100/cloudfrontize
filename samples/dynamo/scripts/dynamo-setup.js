const { DynamoDB } = require("@aws-sdk/client-dynamodb");
const { SecretsManager } = require("@aws-sdk/client-secrets-manager");
const { program } = require("commander");


// 1. Setup CLI Options
program
    .version("1.4.0")
    .description("Smart Overwrite Setup for Lambda@Edge Auth Simulation")
    .requiredOption("-u, --username <name>", "User to create/update for authentication")
    .requiredOption("-p, --password <pass>", "Password for the user")
    .option("-e, --endpoint <url>", "LocalStack endpoint URL", "http://localhost:4566")
    .option("-r, --region <name>", "AWS region", "us-east-1")
    .parse(process.argv);

const options = program.opts();

const config = {
    endpoint: options.endpoint,
    region: options.region,
    credentials: { accessKeyId: "test", secretAccessKey: "test" },
};

const dynamoDb = new DynamoDB(config);
const secretsManager = new SecretsManager(config);

async function setup() {
    console.log(`🚀 Processing credentials for: ${options.username}`);

    // --- 1. DynamoDB: Table Initialization ---
    try {
        await dynamoDb.createTable({
            TableName: 'Users',
            AttributeDefinitions: [{ AttributeName: 'username', AttributeType: 'S' }],
            KeySchema: [{ AttributeName: 'username', KeyType: 'HASH' }],
            ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
        });
        console.log("✅ Table 'Users' ensured.");
    } catch (err) {
        if (err.name !== "ResourceInUseException") throw err;
    }

    // --- 2. Smart Overwrite Logic ---
    try {
        const result = await dynamoDb.putItem({
            TableName: "Users",
            Item: {
                username: { S: options.username },
                password: { S: options.password }
            },
            // This returns the data that was there BEFORE the overwrite
            ReturnValues: "ALL_OLD"
        });

        if (result.Attributes) {
            console.warn(`[UPDATE] ⚠️  User '${options.username}' already existed. The password has been OVERWRITTEN.`);
        } else {
            console.log(`[CREATE] ✅ User '${options.username}' created successfully.`);
        }
    } catch (err) {
        console.error("❌ DynamoDB Error:", err.message);
    }

    // --- 3. Secrets Manager Update (Always Sync) ---
    try {
        await secretsManager.createSecret({
            Name: 'MyDBCredentials',
            SecretString: JSON.stringify({ username: options.username, password: options.password }),
        });
        console.log("✅ Secret 'MyDBCredentials' created.");
    } catch (err) {
        if (err.name === "ResourceExistsException") {
            await secretsManager.updateSecret({
                SecretId: 'MyDBCredentials',
                SecretString: JSON.stringify({ username: options.username, password: options.password }),
            });
            console.log("✅ Secret 'MyDBCredentials' updated to match the new user data.");
        } else {
            console.error("❌ SecretsManager Error:", err.message);
        }
    }

    console.log('\n✨ Setup complete. Lambda@Edge is ready to authenticate with the latest credentials.');
}

setup().catch(console.error);
