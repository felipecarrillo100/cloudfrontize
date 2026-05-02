# Exercise 1.1: The Security Guard

## 🎭 The Scenario
Your company’s security audit just failed. Your backend servers are managed by another team and they refuse to add HSTS headers. You need to enforce security at the Edge.

## 📖 The Lesson: Security at the Edge

Modern web security relies on specific HTTP headers that tell the browser how to behave safely. One of the most important is **HSTS (HTTP Strict Transport Security)**, which forces browsers to always use HTTPS instead of HTTP, preventing man-in-the-middle attacks.

### Why Edge Injection?
As a CloudFront Architect, you often deal with legacy or "black-box" origins. Injecting headers at the **CloudFront Edge** is a professional-grade strategy that allows you to:
1.  **Centralize Policy**: Apply security headers consistently across all your assets (S3 buckets, EC2 clusters, external APIs) regardless of the origin.
2.  **Decouple Security from Logic**: Your application code doesn't need to be polluted with infrastructure-level security configurations.
3.  **Zero-Latency Rollout**: Update security policies globally in seconds without requiring a redeployment or a "cold boot" of your backend services.

### The `viewer-response` Hook
To modify a response before it reaches the user, we use the `viewer-response` hook. This hook runs **after** CloudFront has retrieved the content (either from its cache or from the origin) but **before** it is sent to the client. This makes it the perfect place to "decorate" the response with additional security metadata.

> [!TIP]
> **Technical Reference**: For a detailed breakdown of the Lambda@Edge event JSON and how headers are represented, see the [Lambda@Edge Event Structure Guide](../../commons/lambda-at-edge-event.md).

## 🎯 Your Goal
Inject the following security headers into every response leaving CloudFront:
1. `Strict-Transport-Security`: `max-age=63072000; includeSubDomains; preload`
2. `X-Content-Type-Options`: `nosniff`

You can setup the headers programmatically inside a `viewer-response` Lambda@Edge function.

## 📝 Starter Code Template
```javascript
'use strict';

exports.hookType = 'viewer-response';

exports.handler = async (event) => {
    const response = event.Records[0].cf.response;
    const headers = response.headers;

    // TODO: Implement your magic here!
    // headers['header-name'] = [{ key: 'Header-Name', value: 'value' }];

    return response;
};
```

## 🛠️ Instructions
1. Open `tutorial/module-1-foundations/exercise-1/index.js`.
2. Implement the missing headers in the `TODO` sections.
3. Run the emulator (serving the `www` sample folder and attaching your hook):
   ```bash
   cloudfrontize www --edge ./tutorial/module-1-foundations/exercise-1/index.js --webui 3001
   ```
   *Note: `www` is the argument telling the emulator which folder to serve as your website.*

4. Open `http://localhost:3000` in your browser.

## 🧪 How to Test

### 1. The Execution Journey (Visual Control Plane)
1.  Open the **WebUI**: `http://localhost:3001`
2.  Trigger a request by refreshing `http://localhost:3000` in your browser.
3.  In the **Real-time Edge Traffic** list, click the request row to expand the **Execution Journey**.
4.  In the journey tree, click the **[L@E: viewer-response]** station.
5.  In the **State Inspector** panel, verify that the **Header Snapshots** now include `strict-transport-security` and `x-content-type-options`.

### 2. Verification with `curl`
```bash
curl -I http://localhost:3000
```
*   **Result**: Check for `strict-transport-security: max-age=63072000; includeSubDomains; preload` in the output.

## 💡 Fidelity Tip
In AWS, `viewer-response` cannot modify certain headers like `Content-Length` or `Server`. Our emulator will warn you if you try to touch "forbidden" headers!

## 🎓 Learning More
- **AWS Reference**: [Adding Response Headers (AWS Docs)](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-examples.html#lambda-examples-adding-response-headers)
- **HSTS Deep Dive**: [MDN: HTTP Strict Transport Security](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security)
- **Keywords**: `viewer-response`, `HSTS`, `Content-Security-Policy`, `Lambda@Edge Header Restrictions`.

---

> [!CAUTION]
> ### 🛑 Forensic Troubleshooting: Port 3000 Hangups
> If the emulator fails to start because "Port 3000 is already in use," it means a previous session didn't close properly. 
> 1. Run: `netstat -ano | findstr :3000` to find the PID.
> 2. Run: `taskkill /F /PID <PID_NUMBER>` to clear the ghost process.
