# 🪣 Origins & Provider Specification

CloudFrontize uses a modular **Provider Architecture** to resolve content. This document defines how to configure and manage different data sources (Origins) and how the emulator routes traffic between them.

---

## 1. Origin Provider Types

CloudFrontize supports three primary provider types, each emulating specific AWS behaviors.

| Type | Backend Engine | Use Case | AWS Parity Level |
| :--- | :--- | :--- | :--- |
| **`s3`** | `S3Provider.ts` | Real AWS S3, MinIO, LocalStack, R2. | **High.** Emulates S3 metadata and error XML. |
| **`local`** | `LocalProvider.ts` | Local filesystem folders. | **Medium.** Emulates S3-like index.html resolution. |
| **`custom`** | (Experimental) | External HTTP/REST endpoints. | **Low.** Currently falls back to local. |

---

## 2. The Unified Origin Schema (`--origins`)

The most powerful way to configure CloudFrontize is via a JSON file. This file combines **Data Sources** (Origins) and **Routing Rules** (Behaviors).

### 2.1 Origin Configuration Object
| Field | Type | Description |
| :--- | :--- | :--- |
| **`id`** | `string` | **Required.** Unique ID for routing (e.g., `primary-s3`). |
| **`type`** | `string` | **Required.** `s3`, `local`, or `custom`. |
| **`bucket`** | `string` | (S3 Only) The name of the bucket. |
| **`endpoint`** | `string` | (S3 Only) Custom URL (e.g., `http://localhost:9000`). |
| **`region`** | `string` | (S3 Only) AWS Region (default: `us-east-1`). |
| **`mode`** | `string` | (S3 Only) `rest` (OAC/OAI) or `website` (Static Hosting). |
| **`forcePathStyle`** | `boolean` | (S3 Only) Forces the AWS SDK to use path-style addressing (`http://endpoint/bucket`). Critical for MinIO and local endpoints without wildcard DNS. Defaults to `true` if `endpoint` is provided. |
| **`directory`** | `string` | (Local Only) Path to the local content folder. |
| **`credentials`**| `object` | `{ accessKeyId, secretAccessKey }` for protected buckets. |

### 2.2 Cache Behavior Object
| Field | Type | Description |
| :--- | :--- | :--- |
| **`pathPattern`** | `string` | **Required.** CloudFront pattern (e.g., `/api/*`, `*.css`). |
| **`targetOriginId`**| `string` | **Required.** The `id` of the origin to handle this path. |

---

## 3. High-Fidelity S3 Modes: REST vs Website

The `mode` property in your configuration significantly changes how CloudFrontize resolves files.

### 3.1 `rest` Mode (Default)
Simulates an S3 bucket accessed via an **Origin Access Control (OAC)** or Identity (OAI).
- **Behavior**: No automatic index files. A request for `/folder/` will result in a **403 Forbidden** (or 404 depending on bucket permissions).
- **Use Case**: Secure API or private asset storage.

### 3.2 `website` Mode
Simulates an S3 bucket configured for **Static Website Hosting**.
- **Behavior**: If a request points to a directory, the provider automatically appends `index.html`.
- **Behavior**: Custom 404 error pages defined in S3 are honored.
- **Use Case**: Front-end single-page applications (SPAs).

---

## 4. Example Gallery: The Origin Cookbook 👨‍🍳

Use these patterns as a template. An AI agent can read these examples to generate a custom `--origins` JSON based on your specific infrastructure.

### Level 1: LocalStack (REST Mode)
**Goal**: Point CloudFrontize to a LocalStack bucket using standard REST API calls. 
*Note: LocalStack automatically handles virtual-host DNS (`*.localhost.localstack.cloud`), so `forcePathStyle` can be safely disabled if using their default configurations.*
```json
{
  "origins": [
    { 
      "id": "localstack-rest", 
      "type": "s3", 
      "bucket": "www",
      "endpoint": "http://localhost:4566",
      "mode": "rest"
    }
  ],
  "behaviors": [
    { "pathPattern": "*", "targetOriginId": "localstack-rest" }
  ]
}
```

### Level 2: LocalStack (Website Mode)
**Goal**: Emulate S3 Static Website Hosting against LocalStack. Directory requests will automatically resolve to `index.html`, and S3 error pages are supported.
```json
{
  "origins": [
    { 
      "id": "localstack-web", 
      "type": "s3", 
      "bucket": "www",
      "endpoint": "http://localhost:4566",
      "mode": "website"
    }
  ],
  "behaviors": [
    { "pathPattern": "*", "targetOriginId": "localstack-web" }
  ]
}
```

### Level 3: MinIO (REST Mode)
**Goal**: Connect to a local MinIO server.
**Critical Rule**: When running MinIO on `localhost`, you **MUST** use `"forcePathStyle": true`. Windows and other OS environments cannot resolve subdomains like `www.localhost` to `127.0.0.1`. Setting this to `true` forces the AWS SDK to request `http://localhost:9000/www/`, bypassing the DNS limitation.
```json
{
  "origins": [
    { 
      "id": "minio-rest", 
      "type": "s3", 
      "bucket": "www",
      "endpoint": "http://localhost:9000",
      "mode": "rest",
      "forcePathStyle": true,
      "credentials": {
        "accessKeyId": "minioadmin",
        "secretAccessKey": "minioadmin123"
      }
    }
  ],
  "behaviors": [
    { "pathPattern": "*", "targetOriginId": "minio-rest" }
  ]
}
```

### Level 4: MinIO (Website Mode)
**Goal**: Serve a static website from MinIO. Because MinIO does not natively support S3 Website Hosting, CloudFrontize will automatically append `index.html` to directory requests for you.
```json
{
  "origins": [
    { 
      "id": "minio-web", 
      "type": "s3", 
      "bucket": "www",
      "endpoint": "http://localhost:9000",
      "mode": "website",
      "forcePathStyle": true,
      "credentials": {
        "accessKeyId": "minioadmin",
        "secretAccessKey": "minioadmin123"
      }
    }
  ],
  "behaviors": [
    { "pathPattern": "*", "targetOriginId": "minio-web" }
  ]
}
```

### Level 3: The "Split-Horizon" Routing
**Goal**: Serve images from S3, but keep your API stubs and CSS on your local machine for rapid editing.
```json
{
  "origins": [
    { "id": "cloud-assets", "type": "s3", "bucket": "production-images" },
    { "id": "local-code", "type": "local", "directory": "./src/static" }
  ],
  "behaviors": [
    { "pathPattern": "/images/*", "targetOriginId": "cloud-assets" },
    { "pathPattern": "*.jpg", "targetOriginId": "cloud-assets" },
    { "pathPattern": "*", "targetOriginId": "local-code" }
  ]
}
```

### Level 4: Multi-Bucket Aggregator
**Goal**: Consolidate data from two different buckets (e.g., User Data and System Assets) behind one CloudFrontize endpoint.
```json
{
  "origins": [
    { "id": "user-bucket", "type": "s3", "bucket": "users-us-east-1" },
    { "id": "sys-bucket", "type": "s3", "bucket": "system-assets-eu-west-1", "region": "eu-west-1" }
  ],
  "behaviors": [
    { "pathPattern": "/u/*", "targetOriginId": "user-bucket" },
    { "pathPattern": "/sys/*", "targetOriginId": "sys-bucket" },
    { "pathPattern": "*", "targetOriginId": "sys-bucket" }
  ]
}
```

---

## 5. Security & Credentials Chain

CloudFrontize uses the standard AWS SDK v3 credential provider chain, supplemented by your JSON configuration.

| Priority | Source | Implementation |
| :--- | :--- | :--- |
| **1 (Highest)**| **JSON Config** | Explicit `credentials` block in `--origins` file. |
| **2** | **Env Vars** | `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`. |
| **3** | **AWS Profile**| Default profile in `~/.aws/credentials`. |

---

## 6. Troubleshooting Origins

### `502 Bad Gateway` (S3 Error)
- **Localhost resolution**: If your S3 clone (MinIO/LocalStack) is running in Docker, `localhost` may fail. Try using `127.0.0.1` or the specific container IP.
- **Protocol Mismatch**: Ensure your `endpoint` starts with `http://` or `https://`.

### `403 Forbidden`
- **REST vs Website**: If you expect `/` to return `index.html` but get a 403, check that your `mode` is set to `website`.
- **Public Access**: Ensure your bucket (if real S3) allows the credentials you provided to perform `s3:GetObject`.

---

## 7. Operational Fidelity Specs

*   **Header Passthrough**: All S3 metadata headers (e.g., `x-amz-meta-*`, `ETag`, `Content-Type`) are passed through the pipeline.
*   **Case Sensitivity**: S3 is case-sensitive. CloudFrontize maintains this even when the underlying local filesystem (Windows/macOS) is not.
*   **ForcePathStyle Defaults**: Automatically defaults to `true` when a custom `endpoint` is provided to protect against `ENOTFOUND` localhost DNS errors.
