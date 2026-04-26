# Exercise 4.1: The Baker

## 🎭 The Scenario
Official Lambda@Edge functions do not support environment variables. However, you need to point your logic to different API endpoints depending on where it’s deployed. 

## 📖 The Lesson: Solving the "No Env Vars" Limit

Unlike standard AWS Lambda, **Lambda@Edge does not support environment variables**. This is a common pain point when you need your code to behave differently in `staging` vs `production`.

### Why this limit exists?
Environment variables are managed by the Lambda service, but Lambda@Edge code is replicated to hundreds of CloudFront edge locations globally. Synchronizing environment variables across all those locations would introduce significant latency.

### The "Baking" Pattern
To solve this, we use a pattern called **Baking**. Instead of looking up variables at runtime, we inject them into the source code during the build process.
- **Source**: `const api = process.env.API_ENDPOINT;`
- **Baked**: `const api = 'https://api.production.com';`

This allows you to maintain a single codebase while producing different "deployment-ready" artifacts for each environment.

> [!TIP]
> **Technical Reference**: For a detailed breakdown of how the Lambda@Edge event structure remains consistent regardless of how your code is built, see the [Lambda@Edge Event Structure Guide](../../commons/lambda-at-edge-event.md).

## 🎯 Your Goal
Use CloudFrontize to "bake" a configuration variable into your code, creating a deployment-ready `.js` file.

## 📝 Starter Code Template
```javascript
'use strict';

exports.hookType = 'viewer-request';

exports.handler = async (event) => {
    // TODO: Use the BAKED variable
    // const api = typeof API_ENDPOINT !== 'undefined' ? ...

    return event.Records[0].cf.request;
};
```

## 🛠️ Instructions
1. Open `tutorial/module-4-production/exercise-1/index.js`.
2. Look at how it handles the missing `API_ENDPOINT`.
3. Create a `.env.baked.variables` file in that directory:
   ```env
   API_ENDPOINT=https://api.production.com
   ```
4. Run the emulator pointing to the original hook:
   ```bash
   cloudfrontize www --edge ./tutorial/module-4-production/exercise-1/index.js --bake ./tutorial/module-4-production/exercise-1/.env.baked.variables --output ./dist/prod_lambda.js
   ```
5. Open the generated `dist/prod_lambda.js` file.
6. Observe how `API_ENDPOINT` has been injected as a top-level constant!

## 💡 Fidelity Tip
This pattern allows you to keep your source code clean while adhering to the AWS "No Env Vars" restriction. By baking values into a build artifact, you maintain security and flexibility.

## 🎓 Learning More
- **Concept Deep Dive**: [Why Environment Variables don't exist in Lambda@Edge](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-at-the-edge-env-vars.html)
- **Keywords**: `Lambda@Edge variables`, `Code Pre-processing`, `Edge Deployment Workflows`.
