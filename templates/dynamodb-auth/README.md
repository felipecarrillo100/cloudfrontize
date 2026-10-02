# DynamoDB auth (LocalStack)

A members area (`/members/*`) whose users are in a **DynamoDB** table. A **Lambda@Edge** function on **origin-request** checks the Basic credentials against the table. Locally, DynamoDB runs in **LocalStack**.

## Run it

```bash
docker compose up -d          # LocalStack on :4566
node scripts/setup.js         # creates the Users table with alice / wonderland
cloudfrontize --webui         # http://localhost:3000/members/index.html
cloudfrontize check
```

## How it works

- The function uses the **AWS SDK v3**, which Lambda's Node.js runtimes include (so does CloudFrontize): nothing to bundle.
- It's on **origin-request**, which runs on cache misses, with up to 30 seconds and more memory than viewer events; a table lookup fits there. Make sure authenticated responses aren't cached for everyone (include `Authorization` in the cache key, or don't cache `/members/*`).
- Passwords are stored as SHA-256 hashes. For real systems, use a slow hash (bcrypt, scrypt) or an identity provider.

CloudFrontize warns that the function connects to `localhost`: AWS Lambda@Edge can't reach your machine. For AWS, remove `ENDPOINT` and give the function's execution role `dynamodb:GetItem` on the table (in us-east-1, or a replicated global table).
