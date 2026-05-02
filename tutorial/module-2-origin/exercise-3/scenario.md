# Exercise 2.3: The Cloaker

## 🎭 The Scenario
Your origin is leaking version data. Since we are serving a static `www` folder, it doesn't naturally produce PHP or Apache headers. To simulate a real-world vulnerable server, we must tell the emulator to "inject" these headers using a headers file or using the WebUI `Header Intelligence`.

## 📖 The Lesson: Security Hardening at the Edge

Exposing the exact version of your server software (like `Apache/2.4.41` or `PHP/5.6.40`) is a major security risk. It gives attackers a clear roadmap of which vulnerabilities to target.

### Why origin-response?
As a CloudFront Architect, you know that the `origin-response` hook is the most efficient place to "sanitize" your headers. By stripping these sensitive headers here, you ensure that:
1.  **Clean Cache (Poisoning Prevention)**: The headers are removed **before** CloudFront stores the response in its cache.
2.  **Global Efficiency**: Every user, regardless of whether they hit the cache or the origin, will receive a "cloaked" response. This provides a universal security layer for all your origins.

### Handling Headers
In Lambda@Edge, header keys are always lowercase in the `headers` object. This normalization ensures your code is robust, even if the origin's casing changes.

> [!TIP]
> **Technical Reference**: For a detailed breakdown of the Lambda@Edge event JSON and the specific "Fidelity Map" structure used for headers, see the [Lambda@Edge Event Structure Guide](../../commons/lambda-at-edge-event.md).

## 🎯 Your Goal
Strip the `Server` and `X-Powered-By` headers at the **Edge** before they are cached by CloudFront.

---

## 📝 Starter Code Template
```javascript
'use strict';

exports.hookType = 'origin-response';

exports.handler = async (event) => {
    const response = event.Records[0].cf.response;
    const headers = response.headers;

    // TODO: Clean up headers
    // delete headers['some-header'];

    return response;
};
```

## 🛠️ Instructions
1. Open `tutorial/module-2-origin/exercise-3/index.js`.
2. Delete the offending headers.
3. Create a file named `origin-headers.json`. Add the headers:
```json
{
  "ResponseHeaders": {
    "Server": "Apache/2.4.41 (Ubuntu)",
    "X-Powered-By": "PHP/5.6.40"
  }
}
```
>**HINT**: This is a particular case compared to the previous exercises. While previously we focused on injecting `Request Headers`, here we must define `Response Headers`. To simulate an origin server's behavior, use the key `ResponseHeaders` in your JSON file (passing a list of key:value pairs as you see in the sample above). This allows you to simulate headers coming from the origin server, which your Lambda@Edge function can then intercept and manipulate before they ever reach the browser!!

>**HINT**: If you prefer, you can inject these same headers using the **Header Intelligence** feature in the **WebUI**. Just ensure you set them in the **Origin** tab rather than the **Viewer** tab..


3. Run the emulator:
   ```bash
   cloudfrontize www --edge ./tutorial/module-2-origin/exercise-3/index.js --headers origin-headers.json --debug --webui 3001 
   ```
## 🧪 How to Test

### 1. The Execution Journey (Visual Control Plane)
1.  Open the **WebUI**: `http://localhost:3001`
2.  Refresh `http://localhost:3000/index.html`.
3.  In the **Real-time Edge Traffic** list, click the request row to expand the **Execution Journey**.
4.  **Fidelity Comparison**:
    - In the journey tree, click the **📦 Origin** station. In the **State Inspector**, verify the "dirty" headers (Apache, PHP) you injected via `origin-headers.json`.
    - Click the **[L@E: origin-response]** station. In the **State Inspector**, verify in the **Header Snapshots** that the sensitive headers have been removed.
    - Click the **Terminal Response** node. Confirm the final response is sanitized.

>**HINT**: Notice Cloudfrontize support hot reload, so you don't need to restart the application as you comment or uncomment sections of the code, just save the file and the changes are applied automatically.

## 💡 Fidelity Tip
`origin-response` is the best place for this because it cleans the headers **before** they enter the CloudFront cache. If you used `viewer-response`, CloudFront would still be caching the "dirty" headers!

## 🎓 Learning More
- **AWS Reference**: [Modifying Response Headers in origin-response (AWS Docs)](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-examples.html#lambda-examples-modifying-response-headers-origin-response)
- **Keywords**: `origin-response`, `Response Header Stripping`, `Edge Security Hardening`.

---

> [!CAUTION]
> ### 🛑 Forensic Troubleshooting: Port 3000 Hangups
> If the emulator fails to start because "Port 3000 is already in use," it means a previous session didn't close properly. 
> 1. Run: `netstat -ano | findstr :3000` to find the PID.
> 2. Run: `taskkill /F /PID <PID_NUMBER>` to clear the ghost process.
