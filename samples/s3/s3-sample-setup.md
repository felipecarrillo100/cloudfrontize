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

Alternatively, you can use Docker Compose to set up MinIO. Refer to `docker-compose.yml` in the `/samples/s3/minio` directory:

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

## 5. Using LocalStack Instead of MinIO

LocalStack is a fully functional local AWS cloud stack. It can be used as an alternative to MinIO for testing S3 setups.

### Setting Up LocalStack

1. Install Docker if not already installed.
2. Refer to `docker-compose.yml` in the `/samples/s3/localstack` directory:

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
      - "localstack-data:/tmp/localstack/data"

volumes:
  localstack-data:
```

3. Start LocalStack:

```powershell
# Start LocalStack using Docker Compose
docker-compose -f docker-compose-localstack.yml up -d
```

### Configuring LocalStack S3

1. Install the AWS CLI if not already installed.
    - Ensure the AWS CLI is installed on your system. You can download it from [AWS CLI Installation Guide](https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html).
   
2. Configure the AWS CLI to use LocalStack:

```powershell
aws configure set aws_access_key_id test
aws configure set aws_secret_access_key test
aws configure set default.region us-east-1
```

### Uploading the `www` Folder to LocalStack

To upload the `www` folder to LocalStack's S3, follow these simple steps:

1. **Install AWS CLI**:
   - Ensure the AWS CLI is installed on your system. You can download it from [AWS CLI Installation Guide](https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html).

2. **Set Up AWS CLI for LocalStack**:
   - Run the following command to configure AWS CLI with LocalStack's dummy credentials:
     ```bash
     aws configure
     ```
     - Enter `test` for both `AWS Access Key ID` and `AWS Secret Access Key`.
     - Set the region to `us-east-1` (or any region you prefer).
     - Leave the default output format blank.

3. **Create an S3 Bucket**:
   - Use the following command to create a bucket in LocalStack:
     ```bash
     aws --endpoint-url=http://localhost:4566 s3 mb s3://www
     ```
     - If you prefer, replace  `www` with your desired bucket name, but notice many of the sample assume it is called www.

4. **Upload the `www` Folder Using aws cli**:
   - Use the following command to upload the entire `www` folder to the bucket:
     ```bash
     aws --endpoint-url=http://localhost:4566 s3 cp ../../www/ s3://www/ --recursive
     ```
   > **Note**: LocalStack 1.4 is incompatible with modern versions of the AWS CLI (v2+) due to changes in S3 request signing. If your upload command fails with a "trailer header" error, use the Node.js script provided below to sync your files.

5. **Upload the `www` Folder Using a nodejs script**:
    - To upload your site assets, first you need to install the script dependencies. Navigate to the `scripts` folder, run `npm install`.
    - Now go back to this folder and execute this command
> ```bash
> node scripts/upload.js --source ../../www --bucket www
> ```
> **Note**  `--source` path if your directory where your files are located, and `--bucket` is the name of the bucket you created in LocalStack.

6. **Verify the Upload**:
   - List the contents of the bucket to ensure the files were uploaded:
     ```bash
     aws --endpoint-url=http://localhost:4566 s3 ls s3://my-bucket/ --recursive
     ```

### Running the Sample with `cloudfrontize`

Run the following command:

```powershell
cloudfrontize --s3-origin www --s3-endpoint http://localhost:4566 --edge ./origin-response-addCustomHeader.js --webui 3001
```

### Expected Behavior

1. The files from the `www` bucket will be served.
2. The `X-Custom-Header: Cloudfrontize-Test` header will be added to the response.

---

## Troubleshooting

### Common Issues

1. **502 Bad Gateway**:
   - Ensure MinIO is running.
   - Verify the endpoint URL.

2. **Missing Files**:
   - Ensure the `/www` folder is uploaded to the `www` bucket.

For more details, refer to the [S3 Origin Documentation](../docs/s3-origin.md).
