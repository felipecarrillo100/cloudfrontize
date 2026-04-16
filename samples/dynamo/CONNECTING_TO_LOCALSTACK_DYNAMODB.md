# Connecting to DynamoDB Hosted in LocalStack

This guide explains how to connect to a DynamoDB instance hosted in a LocalStack Docker container. It also demonstrates how to use an existing Lambda function to perform authentication and integrate with AWS Secrets Manager.

---

## Prerequisites

1. **Docker**: Ensure Docker is installed on your machine. You can download it from [Docker Installation Guide](https://docs.docker.com/get-docker/).

2. **LocalStack**: Ensure LocalStack is running on your machine. You can start it using Docker Compose (see below).

3. **AWS CLI**: Install the AWS CLI from [AWS CLI Installation Guide](https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html).

4. **Node.js**: Install Node.js and npm for running scripts.

5. **DynamoDB Table**: Create a DynamoDB table named `Users` with a primary key `username` (String).

6. **Secrets Manager**: Add a secret named `MyDBCredentials` in LocalStack's Secrets Manager.

---

## Setting Up LocalStack with Docker Compose

Create a `docker-compose.yml` file with the following content:

```yaml
version: '3.8'

services:
  localstack:
    image: localstack/localstack:1.4
    container_name: localstack_dynamo
    ports:
      - "4566:4566" # LocalStack Gateway
      - "8000:8000" # DynamoDB Service
    environment:
      - SERVICES=dynamodb,secretsmanager
      - DEBUG=1
      - DATA_DIR=/tmp/localstack/data
      - LAMBDA_EXECUTOR=docker
    volumes:
      - "/var/run/docker.sock:/var/run/docker.sock"
      - "localstack-data:/tmp/localstack/data"

volumes:
  localstack-data:
```

Start LocalStack using Docker Compose:

```powershell
docker-compose up -d
```

---

## LocalStack Configuration

### Using AWS CLI

1. **Configure AWS CLI for LocalStack**:

   ```powershell
   aws configure set aws_access_key_id test
   aws configure set aws_secret_access_key test
   aws configure set default.region us-east-1
   ```

2. **Create DynamoDB Table**:

   ```powershell
aws --endpoint-url=http://localhost:4566 dynamodb create-table `
    --table-name Users `
    --attribute-definitions AttributeName=username,AttributeType=S `
    --key-schema AttributeName=username,KeyType=HASH `
    --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5
   ```

3. **Add Items to the Table**:

   ```powershell
aws --endpoint-url=http://localhost:4566 dynamodb put-item `
  --table-name Users `
  --item '{\"username\": {\"S\": \"testuser\"}, \"password\": {\"S\": \"testpass\"}}'
   ```

4. **Add Secret to Secrets Manager**:

   ```powershell
aws --endpoint-url=http://localhost:4566 secretsmanager create-secret `
  --name MyDBCredentials `
--secret-string '{\"username\": \"dbuser\", \"password\": \"dbpass\"}'
   ```

5. At this point you are done!  If you want to perform a sanity check to make sure all went right you may want to run:
```
aws --endpoint-url=http://localhost:4566 secretsmanager get-secret-value --secret-id MyDBCredentials
```
---

### Using Node.js Script to create users in dynamo

1. **Install Dependencies**:

   Navigate to the `scripts` folder and run:

   ```bash
   npm install
   ```

2. **Run Script**:

   ```bash
   node scripts/dynamo-setup --username "user123" --password "password123"
   ```
Where the user123 and password123 are the username and credential of a new user.
---

## Lambda Function Overview

The Lambda function `origin-request-dynamo-auth.js` performs the following steps:

1. **Extract Authorization Header**: Parses the `Authorization` header from the incoming request.
2. **Fetch User from DynamoDB**: Queries the `Users` table to retrieve the user details.
3. **Retrieve Secrets**: Fetches database credentials from Secrets Manager.
4. **Verify Password**: Compares the provided password with the stored password.
5. **Inject Custom Header**: Adds an `X-Authenticated-User` header to the request if authentication is successful.

### Code Snippet

Here is a snippet from the Lambda function:

```javascript
const dynamoDb = new DynamoDB(AWS_CONFIG);
const secretsManager = new SecretsManager(AWS_CONFIG);

const userResult = await dynamoDb.getItem({
    TableName: 'Users',
    Key: { username: { S: username } },
});

const dbSecret = await secretsManager.getSecretValue({ SecretId: 'MyDBCredentials' });
```

---

## Testing the Setup

1. **Start LocalStack**: Ensure LocalStack is running.
2. **Deploy Lambda Function**: Deploy the `origin-request-dynamo-auth.js` function to your CloudFrontize setup.
```bash
2. ```
3. **Test Authentication**: Send a request with the `Authorization` header to trigger the Lambda function.

Example from your browser try to reach:

```
http://localhost:3000 
```
Yuo will be asked to log in,  use any of the user you created 

---

## Troubleshooting

### Common Issues

1. **Table Not Found**:
   - Ensure the DynamoDB table `Users` is created.
   - Verify the endpoint URL.

2. **Secret Not Found**:
   - Ensure the secret `MyDBCredentials` exists in Secrets Manager.

3. **Authentication Failure**:
   - Verify the `Authorization` header value.
   - Check the stored password in the `Users` table.

---

## Conclusion

This setup demonstrates how to use LocalStack to simulate AWS services locally and integrate them with CloudFrontize. The `origin-request-dynamo-auth.js` function serves as a practical example of connecting to DynamoDB and Secrets Manager in a local development environment.
