# Exercise 3.3: The Inspector

## 🎭 The Scenario
Your API is being targeted by a specific bot that always sends "SQL-INJECTION" in the POST body. You want to block these requests at the edge to save origin resources.

## 📖 The Lesson: Request Body Inspection

Most Lambda@Edge tasks focus on headers and URIs, but sometimes you need to look deeper into the actual payload being sent by the user.

### Accessing the Body
By default, CloudFront doesn't pass the request body to Lambda@Edge to save on performance. However, you can enable "Include Body" to gain visibility into POST or PUT requests.

### Base64 Encoding
Because request bodies can contain binary data, Lambda@Edge always passes the body to your function as a **Base64 encoded string**. To inspect the content, you must:
1.  Verify if `request.body` exists.
2.  Extract the `request.body.data`.
3.  Decode it using `Buffer.from(data, 'base64').toString()`.

### Security Filtering
This pattern is perfect for building a lightweight Web Application Firewall (WAF) directly in code, allowing you to block known malicious payloads before they ever reach your backend.

> [!TIP]
> **Technical Reference**: For a detailed breakdown of the `request.body` object and its properties, see the [Lambda@Edge Event Structure Guide](../../commons/lambda-at-edge-event.md).

## 🎯 Your Goal
Inspect the request body and return a `403 Forbidden` if malicious content (such as SQL) is detected.

## 📝 Starter Code Template
```javascript
'use strict';

exports.hookType = 'viewer-request';

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;

    // TODO: Inspect body
    // HINT: The body arrives Base64 encoded from the Edge
    // if (request.body && request.body.data) { ... }

    return request;
};
```

## 🛠️ Instructions
1. Open `tutorial/module-3-edge/exercise-3/index.js`.
2. Decode the `request.body.data` from base64.
3. Check for SQL keywords.
4. Run the emulator:
   ```bash
   cloudfrontize www --edge ./tutorial/module-3-edge/exercise-3/index.js
   ```
5. **Forensic Verification**:
   - **Terminal Log Trace**: 
     - On safe request: `[L@E: Inspector] Body Validation: Safe`.
     - On malicious request: `[L@E: Inspector] Body Validation: Threat Detected`.
   - **Hook Highway (Web UI)**: Open `http://localhost:3001`. Select the POST request.
   - **Body Intelligence**: Select the `[L@E: viewer-request]` stage and go to the **Body** tab. Click **DECODE** to see the payload that triggered your security logic.
   - **Status Check**: Verify the final response is a `403 Forbidden`.

## 💡 Fidelity Tip
In AWS, to access the request body, you must check the **Include Body** option in the Lambda association. In the emulator, bodies are included automatically if they are small enough (< 40KB)!

## 🎓 Learning More
- **AWS Reference**: [Accessing the Request Body (AWS Docs)](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-examples.html#lambda-examples-accessing-request-body)
- **Keywords**: `viewer-request body access`, `Request Body Fidelity`, `Edge Payload Inspection`.
