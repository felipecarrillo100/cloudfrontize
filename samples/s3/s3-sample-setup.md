# S3 Sample Setup with Local S3 Alternatives and Lambda@Edge

## Table of Contents
- [1. Overview & Architecture](#1-overview--architecture)
- [2. Option A: Using LocalStack (Recommended)](#2-option-a-using-localstack-recommended)
  - [Setting Up LocalStack](#setting-up-localstack)
  - [Uploading the `/www` Folder](#uploading-the-www-folder)
- [3. Option B: Using MinIO](#3-option-b-using-minio)
  - [Setting Up MinIO & NGINX](#setting-up-minio--nginx)
  - [Accessing MinIO Web Interface](#accessing-minio-web-interface)
  - [Uploading the `/www` Folder](#uploading-the-www-folder-1)
- [4. Creating a Lambda@Edge Function](#4-creating-a-lambdaedge-function)
  - [Example Function](#example-function)
- [5. Running the Sample with `cloudfrontize`](#5-running-the-sample-with-cloudfrontize)
  - [Command for LocalStack](#command-for-localstack)
  - [Command for MinIO](#command-for-minio)
  - [Alternative: Using `--origins` Configuration File](#alternative-using---origins-configuration-file)
- [6. Troubleshooting](#6-troubleshooting)
  - [Common Issues](#common-issues)

---

## 1. Overview & Architecture

This guide provides step-by-step instructions for setting up a local S3 alternative, uploading the `/www` sample folder to a bucket, creating a Lambda@Edge (L@E) function to add a custom header, and using `cloudfrontize` to test the setup.

We offer two popular alternatives for local S3 testing:

1. **LocalStack (Recommended):** A comprehensive local AWS cloud stack. It natively supports both the standard S3 REST API and S3 Website endpoints, making it the most seamless emulation experience.
2. **MinIO:** A lightweight, high-performance object storage server. MinIO strictly implements the REST API and lacks native S3 Website functionality, but `cloudfrontize` automatically emulates Website mode directory indexing (`index.html`) when connecting to it.

---

## 2. Option A: Using LocalStack (Recommended)

LocalStack provides a fully functional local AWS cloud stack out of the box.

### Setting Up LocalStack

1. Install Docker if not already installed.
2. Navigate to the `/samples/s3/localstack` directory, which contains the following `docker-compose.yml`:

> **NOTE:** This setup uses **LocalStack 1.4** to avoid the mandatory API key requirement in newer versions. To use a more recent version, obtain a license key from LocalStack and add it as the `LOCALSTACK_API_KEY` environment variable in your `docker-compose-localstack.yml` file.

```yaml
version: '3.8'

services:
  localstack:
    image: localstack/localstack:1.4
    container_name: localstack_s3
    ports:
      - "4566:4566" # LocalStack Gateway
      - "4572:4572" # S3 Service
    environment:
      - SERVICES=s3
      - DEBUG=1
      - DATA_DIR=/tmp/localstack/data
      - LAMBDA_EXECUTOR=docker
    volumes:
      - "/var/run/docker.sock:/var/run/docker.sock"
      - "localstack-data-s3:/tmp/localstack/data"

volumes:
  localstack-data-s3:
```

3. Start LocalStack using Docker Compose:

```powershell
docker-compose up -d
```

### Uploading the `/www` Folder

The `/www` folder contains the sample files to be uploaded to the `www` bucket.

#### 1. Using 's3-upload-site' Utility (Preferred Method)

To upload your site assets easily, we highly recommend using the `s3-upload-site` utility.

1. Install the utility globally:
   ```bash
   npm install -g s3-upload-site
   ```
2. Upload your site assets:
   ```bash
   s3-upload-site --source ../../www --bucket www --create
   ```

#### 2. Alternative: Using AWS CLI
> **Note**: LocalStack 1.4 is incompatible with modern versions of the AWS CLI (v2+) due to changes in S3 request signing. If your upload command fails with a "trailer header" error, please use the `s3-upload-site` utility described above.

1. Ensure the AWS CLI is installed.
2. Configure dummy credentials:
   ```powershell
   aws configure set aws_access_key_id test
   aws configure set aws_secret_access_key test
   aws configure set default.region us-east-1
   ```
3. Create the bucket and upload the folder:
   ```powershell
   aws --endpoint-url=http://localhost:4566 s3 mb s3://www
   aws --endpoint-url=http://localhost:4566 s3 cp ../../www/ s3://www/ --recursive
   ```

---

## 3. Option B: Using MinIO

MinIO is a great lightweight alternative that pairs perfectly with `cloudfrontize`.

### Setting Up MinIO

Navigate to the `/samples/s3/minio` directory, which contains the configured `docker-compose.yml`:

```yaml
version: '3.8'

services:
  minio:
    image: quay.io/minio/minio
    container_name: minio
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin123
    command: server /data --console-address ":9001"
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio-data:/data

volumes:
  minio-data:
```

Start the stack using Docker Compose:

```powershell
docker-compose up -d
```

### Accessing MinIO Web Interface

1. Open your browser and navigate to `http://localhost:9001`.
2. Log in using the credentials:
   - **Username**: `minioadmin`
   - **Password**: `minioadmin123`

### Uploading the `/www` Folder

#### 1. Using 's3-upload-site' Utility (Preferred Method)

1. Install the utility globally:
   ```bash
   npm install -g s3-upload-site
   ```
2. Upload your site assets:
   ```bash
   s3-upload-site --source ../../www --bucket www --create --endpoint http://localhost:9000 --key minioadmin --secret minioadmin123
   ```

#### 2. Alternative: Using MinIO Client (mc)

1. Install the MinIO client (`mc`) from [MinIO Downloads](https://min.io/download).
2. Configure the client and upload:
   ```powershell
   mc alias set local http://localhost:9000 minioadmin minioadmin123
   mc mb local/www
   mc cp -r ../../www local/www
   ```

#### 3. Alternative: Using the Web Interface

1. Navigate to `http://localhost:9001`.
2. Create a bucket named `www`.
3. Upload the contents of the `/www` folder into the `www` bucket via the UI.

---

## 4. Creating a Lambda@Edge Function

The Lambda@Edge function will add a custom header (`X-Custom-Header: Cloudfrontize-Test`) to the response.

### Example Function

Save the following code as `origin-response-addCustomHeader.js` in the `/samples/s3/` directory:

```javascript
'use strict';

exports.handler = async (event) => {
    const response = event.Records[0].cf.response;
    response.headers['x-custom-header'] = [{
        key: 'X-Custom-Header',
        value: 'Cloudfrontize-Test',
    }];
    return response;
};
```
> **Hint** The prefix `origin-response` tells `cloudfrontize` to execute this function on the origin response event. You can also use `viewer-request`, `viewer-response`, or `origin-request` as prefixes to specify different events.

---

## 5. Running the Sample with `cloudfrontize`

Once your S3 environment is populated and your edge function is ready, use `cloudfrontize` to test the setup.

### Command for LocalStack

```powershell
cloudfrontize --s3-origin www --s3-endpoint http://localhost:4566 --edge ./origin-response-addCustomHeader.js --webui 3001
```

### Command for MinIO

```powershell
$env:AWS_ACCESS_KEY_ID="minioadmin"
$env:AWS_SECRET_ACCESS_KEY="minioadmin123"
cloudfrontize --s3-origin www --s3-endpoint http://localhost:9000 --edge ./origin-response-addCustomHeader.js --webui 3001
```

### Expected Behavior

1. The files from the `www` bucket will be served.
2. The `X-Custom-Header: Cloudfrontize-Test` header will be added to the response.

### Alternative: Using `--origins` Configuration File

Instead of specifying the S3 origin directly in the command, you can use a JSON configuration file. This is particularly useful for Multi-Origin setups.

Save this as `my-origins-s3.json` in the `/samples/s3/` directory:
```json
{
  "bucket": "www",
  "region": "us-east-1",
  "endpoint": "http://localhost:9000",
  "credentials": {
    "accessKeyId": "minioadmin",
    "secretAccessKey": "minioadmin123"
  },
  "forcePathStyle": true,
  "mode": "website"
}
```

Then run:
```powershell
cloudfrontize --origins ./my-origins-s3.json --edge ./origin-response-addCustomHeader.js --webui 3001
```

---

## 6. Troubleshooting

### Common Issues

1. **502 Bad Gateway**:
   - Ensure the respective LocalStack or MinIO container is running.
   - Verify the endpoint URL explicitly maps to your running service's port (`4566` vs `9000`).

2. **Missing Files**:
   - Ensure the `/www` folder is completely uploaded to the `www` bucket.

For more details, refer to the [S3 Origin Documentation](../docs/s3-origin.md).
