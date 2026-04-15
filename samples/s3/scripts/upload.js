const { S3Client, PutObjectCommand, PutBucketWebsiteCommand } = require("@aws-sdk/client-s3");
const { program } = require("commander");
const fs = require("fs");
const path = require("path");
const mime = require("mime-types");

// 1. Setup CLI Options
program
    .version("1.1.0")
    .description("Upload folder to S3 and optionally configure as a website")
    .requiredOption("-s, --source <path>", "Source folder path")
    .requiredOption("-b, --bucket <name>", "Target S3 bucket name")
    .option("-m, --mode <type>", "Mode: 'website' or 'standard'", "website") // Default is website
    .option("-e, --endpoint <url>", "S3 endpoint URL", "http://localhost:4566")
    .option("-r, --region <name>", "AWS region", "us-east-1")
    .parse(process.argv);

const options = program.opts();

// 2. Configure S3 Client
const s3Client = new S3Client({
    endpoint: options.endpoint,
    region: options.region,
    forcePathStyle: true,
    credentials: {
        accessKeyId: "test",
        secretAccessKey: "test",
    },
});

const configureWebsite = async (bucketName) => {
    console.log(`🔧 Configuring bucket '${bucketName}' for static website hosting...`);
    try {
        await s3Client.send(
            new PutBucketWebsiteCommand({
                Bucket: bucketName,
                WebsiteConfiguration: {
                    IndexDocument: { Suffix: "index.html" },
                    ErrorDocument: { Key: "index.html" } // Helpful for SPA routing
                },
            })
        );
        console.log("✅ Website hosting enabled.");
    } catch (err) {
        console.error("⚠️ Failed to configure website mode:", err.message);
    }
};

const uploadFolder = async (sourceDir, bucketName) => {
    const absoluteSourcePath = path.resolve(sourceDir);

    if (!fs.existsSync(absoluteSourcePath)) {
        console.error(`❌ Error: Source path does not exist: ${absoluteSourcePath}`);
        process.exit(1);
    }

    // Configure bucket if mode is website
    if (options.mode === "website") {
        await configureWebsite(bucketName);
    }

    const getFiles = (dir) => {
        const results = [];
        const list = fs.readdirSync(dir);
        list.forEach((file) => {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            if (stat && stat.isDirectory()) {
                results.push(...getFiles(filePath));
            } else {
                results.push(filePath);
            }
        });
        return results;
    };

    const files = getFiles(absoluteSourcePath);

    for (const filePath of files) {
        const relativePath = path.relative(absoluteSourcePath, filePath);
        const fileKey = relativePath.replace(/\\/g, "/");
        const fileContent = fs.readFileSync(filePath);
        const contentType = mime.lookup(filePath) || "application/octet-stream";

        try {
            await s3Client.send(
                new PutObjectCommand({
                    Bucket: bucketName,
                    Key: fileKey,
                    Body: fileContent,
                    ContentType: contentType,
                })
            );
            console.log(`✅ Uploaded: ${fileKey} (${contentType})`);
        } catch (err) {
            console.error(`❌ Failed: ${fileKey} | Error: ${err.message}`);
        }
    }

    console.log(`\n✨ Sync complete in ${options.mode} mode.`);

    if (options.mode === "website") {
        console.log(`🔗 Access your site at: http://${options.bucket}.s3-website.${options.region}.localhost.localstack.cloud:4566/`);
    }
};

// 3. Execute
uploadFolder(options.source, options.bucket);
