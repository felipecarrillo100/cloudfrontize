# S3 origin (MinIO)

The site is served from an **S3 bucket**. Locally the bucket is in **MinIO** (an S3-compatible server in Docker); for AWS, point the origin at your bucket instead. A **Lambda@Edge** origin-response function adds `Cache-Control` by file type, since S3 objects often have none.

## Run it

```bash
docker compose up -d                      # MinIO on :9000 (console :9001), uploads ./site to "my-site"
export AWS_ACCESS_KEY_ID=minioadmin AWS_SECRET_ACCESS_KEY=minioadmin
cloudfrontize --webui                     # http://localhost:3000/index.html
cloudfrontize check                       # once MinIO is up
```

The **Origin** inspector's *Test connection* tells you whether the bucket is reachable with these credentials.

## The origin

```json
{ "id": "bucket", "type": "s3", "bucket": "my-site", "region": "us-east-1",
  "endpoint": "http://localhost:9000", "forcePathStyle": true, "mode": "rest",
  "credentials": { "fromEnv": true } }
```

- `"mode": "rest"` behaves like a bucket behind CloudFront with Origin Access Control: folders don't serve `index.html`, and missing objects are `403`. Use `"website"` for a bucket with static website hosting.
- For AWS, remove `endpoint` and `forcePathStyle`, set the region, and use `"credentials": { "profile": "<your profile>" }` or the environment. Keys never go in the project.
