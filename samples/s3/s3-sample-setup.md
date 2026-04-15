# S3 Sample Setup with MinIO and Lambda@Edge

This guide provides step-by-step instructions for setting up MinIO, uploading the `/www` folder to a bucket, creating a Lambda@Edge (L@E) function to add a custom header, and using `cloudfrontize` to test the setup.

---

## 1. Setting Up MinIO

MinIO is an S3-compatible object storage service. Follow these steps to set it up locally:

### Using Docker

Run the following command to start a MinIO instance:

```powershell
# Pull and run MinIO Docker container
docker run -p 9000:9000 -p 9001:9001 \
  -e "MINIO_ROOT_USER=minioadmin" \
  -e "MINIO_ROOT_PASSWORD=minioadmin123" \
  quay.io/minio/minio server /data --console-address ":9001"
```

### Using Docker Compose

Alternatively, you can use Docker Compose to set up MinIO. Save the following content as `docker-compose.yml` in the `/samples/s3/` directory:

```yaml
version: '3.8'

services:
  minio:
    image: quay.io/minio/minio
    container_name: minio
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin123
    command: server /data --console-address ":9001"
    volumes:
      - minio-data:/data

volumes:
  minio-data:
```

Run the following command to start MinIO:

```powershell
# Start MinIO using Docker Compose
docker-compose up -d
```

### Accessing MinIO Web Interface

1. Open your browser and navigate to `http://localhost:9001`.
2. Log in using the credentials:
   - **Username**: `minioadmin`
   - **Password**: `minioadmin123`

---

## 2. Uploading the `/www` Folder

The `/www` folder contains the sample files to be uploaded to the `www` bucket in MinIO.

### Using MinIO Client (mc)

1. Install the MinIO client (`mc`) from [MinIO Downloads](https://min.io/download).
2. Configure the client:

   ```powershell
   mc alias set local http://localhost:9000 minioadmin minioadmin123
   ```

3. Create the `www` bucket:

   ```powershell
   mc mb local/www
   ```

4. Upload the `/www` folder:

   ```powershell
   mc cp -r D:/antigravity/cloudfrontize/www local/www
   ```

### Using the Web Interface

1. Navigate to the MinIO web interface.
2. Create a bucket named `www`.
3. Upload the contents of the `/www` folder into the `www` bucket.

---

## 3. Creating a Lambda@Edge Function

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

## 4. Running the Sample with `cloudfrontize`

Use `cloudfrontize` to test the setup with MinIO and the Lambda@Edge function.

### Command

Run the following command:

```powershell
$env:AWS_ACCESS_KEY_ID="minioadmin"
$env:AWS_SECRET_ACCESS_KEY="minioadmin123"
cloudfrontize --s3-origin www --s3-endpoint http://localhost:9000 --edge ./origin-response-addCustomHeader.js --webui 3001
```

### Expected Behavior

1. The files from the `www` bucket will be served.
2. The `X-Custom-Header: Cloudfrontize-Test` header will be added to the response.

---

### Alternative: Using `--origins` for S3 Configuration

Instead of specifying the S3 origin directly in the command, you can use a JSON configuration file with the `--origins` option. This allows for more advanced setups, such as multi-origin configurations.

#### Example Configuration File

Save the following content as a JSON file (e.g., `my-origins.json`) in the `/samples/s3/` directory:

```json
{
  "bucket": "www",
  "endpoint": "http://localhost:9000",
  "credentials": {
    "accessKeyId": "minioadmin",
    "secretAccessKey": "minioadmin123"
  }
}
```

#### Command

Run the following command to use your configuration file:

```powershell
cloudfrontize --origins ./my-origins-s3.json --edge ./origin-response-addCustomHeader.js --webui 3001
```

This approach is useful for more complex setups or when you want to manage credentials and endpoints in a separate file.

---

## Troubleshooting

### Common Issues

1. **502 Bad Gateway**:
   - Ensure MinIO is running.
   - Verify the endpoint URL.

2. **Missing Files**:
   - Ensure the `/www` folder is uploaded to the `www` bucket.

For more details, refer to the [S3 Origin Documentation](../docs/s3-origin.md).
