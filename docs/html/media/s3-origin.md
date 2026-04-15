# 🪣 S3 & Multi-Origin Support

CloudFrontize isn't just for local files. You can point it at a real **AWS S3 Bucket** or an S3-compatible service like **MinIO**, **LocalStack**, or **Cloudflare R2**. This allows you to test your Lambda@Edge logic against the exact same data you use in production.

---

## ⚡ Quick Start: S3 Proxying

To start CloudFrontize as a proxy to an S3 bucket instead of a local directory, use the `--s3-origin` flag.

### 1. Basic AWS S3
If your machine is already configured with AWS credentials (via `~/.aws/credentials` or environment variables):

```bash
cloudfrontize --s3-origin my-production-bucket --edge ./my-hook.js
```

### 2. S3-Compatible (MinIO / LocalStack)
When using MinIO or other local S3 clones, you must specify the custom endpoint. CloudFrontize will automatically enable `forcePathStyle` for these services.

```bash
# Set credentials if not already in environment
$env:AWS_ACCESS_KEY_ID="minioadmin"
$env:AWS_SECRET_ACCESS_KEY="minioadmin123"

cloudfrontize --s3-origin www --s3-endpoint http://localhost:9000 --edge ./my-hook.js
```

---

## 🛠️ Advanced: Multi-Origin Configuration

In production, CloudFront often has multiple origins (e.g., an S3 bucket for assets and an ALB for the API). You can simulate this complex routing using a JSON configuration file.

### Multiple Origins Example (`origins.json`)

```json
{
  "origins": [
    {
      "id": "s3-assets",
      "type": "s3",
      "bucket": "my-assets",
      "region": "us-east-1"
    },
    {
      "id": "local-api",
      "type": "local",
      "directory": "./api-stubs"
    }
  ],
  "behaviors": [
    { "pathPattern": "/assets/*", "targetOriginId": "s3-assets" },
    { "pathPattern": "/api/*", "targetOriginId": "local-api" },
    { "pathPattern": "*", "targetOriginId": "s3-assets" }
  ]
}
```

**Run with:**
```bash
cloudfrontize --origins ./origins.json --edge ./my-hook.js
```

---

## 🔑 Credential Management

CloudFrontize looks for credentials in the following order:

1.  **JSON Config**: Explicitly defined `credentials` inside your `--origins` file.
2.  **Environment Variables**: `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.
3.  **AWS Profile**: Your default AWS CLI profile (if using standard AWS S3).

### JSON Credential Format
> 💡 **Note**: If you are using a simple flat config file (single origin), the `"type": "s3"` property is optional—CloudFrontize will automatically infer the type if a `bucket` property is present.

```json
{
  "bucket": "www",
  "region": "us-east-1",
  "endpoint": "http://localhost:9000",
  "credentials": {
    "accessKeyId": "minioadmin",
    "secretAccessKey": "minioadmin123"
  }
}
```

---

## 🔍 Troubleshooting

### 1. 502 Bad Gateway / Connection Refused
If you receive a `502` and see `[S3 Error] ECONNREFUSED` in your terminal:
- **Check MinIO Status**: Ensure your local S3 server is actually running.
- **Localhost vs 127.0.0.1**: Sometimes `localhost` resolves to an IPv6 address (`::1`) while your service is only listening on IPv4. Try changing your endpoint to `http://127.0.0.1:9000`.

### 2. Forbidden Header Mutations
AWS strictly forbids changing certain headers (like `Host` or `Content-Length`) in some hooks. Use the `--strict` flag to catch these errors locally with detailed explanations.

### 3. Missing Data
If your bucket shows a **404 Not Found** but the files exist on your disk, ensure you've actually synchronized them to S3. CloudFrontize does not automatically upload your local files to your S3 bucket.

---

## ⚖️ Fidelity & Quirks

CloudFrontize emulates specific S3/CloudFront integration behaviors:

*   **REST vs Website Mode**: Use `--mode rest` (default) to simulate an S3 REST OAC/OAI endpoint (no auto-indexing). Use `--mode website` to simulate an S3 Static Website Hosting endpoint (automatic `index.html` resolution).
*   **Redirects**: 301/307 redirects from S3 are properly passed through the `origin-response` hooks.
*   **Case Sensitivity**: S3 keys are case-sensitive. CloudFrontize maintains this strictness even when running on Windows/macOS.
