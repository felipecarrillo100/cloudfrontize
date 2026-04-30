# Exercise 4.1: The Baker

## 🎭 The Scenario
Official Lambda@Edge functions do not support environment variables. However, you need to point your logic to different API endpoints depending on where it's deployed. 

## 📖 The Lesson: Solving the "No Env Vars" Limit

Unlike standard AWS Lambda, **Lambda@Edge does not support environment variables**. This is a common pain point when you need your code to behave differently in `staging` vs `production`.

### Why this limit exists?
Environment variables are managed by the Lambda service, but Lambda@Edge code is replicated to hundreds of CloudFront edge locations globally. Synchronizing environment variables across all those locations would introduce significant latency.

### The "Baking" Pattern
To solve this, we use a pattern called **Baking**. Instead of looking up variables at runtime, we inject them into the source code during the build process using **double-underscore delimited tokens** as placeholders.

- **Source**: `const api = "__API_ENDPOINT__";`
- **Baked**: `const api = "https://api.production.com";`

The `--bake` flag tells CloudFrontize to scan your code for any `__TOKEN_NAME__` placeholders and replace them with the corresponding values from your `.variables` file before the hook runs.

> [!TIP]
> **Technical Reference**: For a detailed breakdown of how the Lambda@Edge event structure remains consistent regardless of how your code is built, see the [Lambda@Edge Event Structure Guide](../../commons/lambda-at-edge-event.md).

> **⚠️ Why not `process.env`?** You might expect to write `process.env.API_ENDPOINT` — that's how standard AWS Lambda works. In Lambda@Edge, however, `process.env` only contains a small fixed set of **AWS runtime variables** (like `AWS_REGION`). You cannot define your own custom variables through the function configuration — that feature is not supported. `process.env.API_ENDPOINT` will always be `undefined`. CloudFrontize faithfully emulates this behaviour. The `__TOKEN__` baking pattern is the correct AWS-aligned solution.

## 🎯 Your Goal
Use CloudFrontize to "bake" a configuration variable into your code, creating a deployment-ready `.js` file.

## 📝 Starter Code Template
```javascript
'use strict';

exports.hookType = 'viewer-request';

// 🍞 BAKE PLACEHOLDER: This will be replaced with the real value during the build step.
const API_ENDPOINT = "__API_ENDPOINT__";

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;

    // TODO: Use the baked variable to tag the request with the correct API endpoint.
    // Hint: how would you check if the placeholder was successfully replaced?

    return request;
};
```

## 🛠️ Instructions
1. Open `tutorial/module-4-production/exercise-1/index.js`.
2. Look at how it uses the `__API_ENDPOINT__` placeholder and handles the "not yet baked" fallback case.
3. Create a file `4.1-baked.variables` in that directory:
   ```env
   API_ENDPOINT=https://api.production.com
   ```
4. Run the emulator pointing to the original hook:
   ```bash
   cloudfrontize www --edge ./tutorial/module-4-production/exercise-1/index.js --bake ./tutorial/module-4-production/exercise-1/.env.baked.variables --output ./prod_ready
   ```
5. Open the generated file at `prod_ready/4.1-baker.js` file.
6. Observe how `__API_ENDPOINT__` has been replaced with the real value!

## 💡 Fidelity Tip
During local development, your placeholder won't be baked yet — the token will still read `"__API_ENDPOINT__"`. The solution shows a robust pattern: check whether the string still matches the `__...__` format and fall back to a local URL. This means the same source file works correctly both locally and in production.

## 🎓 Learning More
- **Concept Deep Dive**: [Why Environment Variables don't exist in Lambda@Edge](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-at-the-edge-env-vars.html)
- **Keywords**: `Lambda@Edge variables`, `Code Pre-processing`, `Edge Deployment Workflows`.
