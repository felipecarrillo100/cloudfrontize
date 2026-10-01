# 4.1 The Baker

## 🎭 The Scenario
Your function must call a different API in development and in production. In regular AWS Lambda you'd use an environment variable, but this is Lambda@Edge.

## 📖 The Lesson: No Environment Variables at the Edge

Lambda@Edge doesn't support environment variables (*"Lambda environment variables (except for reserved environment variables)"* are not supported): `process.env` only has AWS's reserved variables, like `AWS_REGION`. CloudFrontize does the same: `process.env.API_ENDPOINT` is `undefined`, and your machine's environment is never visible to functions.

The usual solution is **baking**: write a placeholder in the code, and replace it with the right value for each environment when you build the function.

```javascript
const API_ENDPOINT = '__API_ENDPOINT__';   // source
const API_ENDPOINT = 'https://api.example.com';   // what's deployed
```

In a project:
- `"bake": { "file": "config/bake.env" }` in `cloudfrontize.json` gives the values used **locally**: CloudFrontize bakes them in when it loads the function, so it runs as it will in AWS.
- `cloudfrontize build --bake config/production.env` writes the **deployable** code with production values to `dist/`.

One source file, one bake file per environment.

## 🗂️ This Project

| Path | What it is |
|---|---|
| `functions/lambda-edge/viewer-response.baker.js` | The Baker: puts the baked endpoint in `X-Api-Endpoint` |
| `config/bake.env` | Local values (`http://localhost:8080`) |
| `config/production.env` | Production values (`https://api.example.com`) |
| `checks.json` | What this tutorial must do, checked automatically |

## 🎯 Your Goal
Use the `__API_ENDPOINT__` placeholder, run the project locally, then build it for production and check the deployed code has the production endpoint.

## 🛠️ Run It
From this folder:
```bash
cloudfrontize validate     # checks the project against AWS rules
cloudfrontize --webui      # serves it on http://localhost:3000, with the workbench on http://localhost:3001
cloudfrontize check        # runs checks.json: does it do what this article says?
```

## 🧪 How to Test
```bash
curl -sI http://localhost:3000/index.html | grep -i x-api-endpoint     # http://localhost:8080
cloudfrontize build --bake config/production.env
grep api.example.com dist/lambda-edge/baker/index.js
```
The build also reports any `__PLACEHOLDER__` without a value, so nothing ships unbaked. In the workbench, a function's **Production build** shows the baked, minified or uglified code.

## 💡 Fidelity Tips
- **Secrets don't belong in code.** Baked values end up in the deployment package. For secrets, read them at run time from AWS Secrets Manager or SSM Parameter Store (Lambda@Edge has network access and the AWS SDK), and cache them between invocations.
- **CloudFront Functions bake too**, but they can't call AWS services: use a CloudFront KeyValueStore for configuration that changes (see [1.12 The Redirect Map](../../05-cff/1.12-redirect-map/README.md)).

## 🎓 Learning More
- **AWS**: [Restrictions on Lambda@Edge: environment variables](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-at-edge-function-restrictions.html#lambda-at-edge-restrictions-features)
