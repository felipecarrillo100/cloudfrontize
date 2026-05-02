# Exercise 3.2: The Architect

## 🎭 The Scenario
You are performing a massive database migration. You want to show a friendly "Maintenance" page to all users without having to stop your servers or change DNS.

## 📖 The Lesson: Global Maintenance Mode

Generating a static response from the Edge is the ultimate "safety switch" for any web application. It allows you to intercept traffic globally and serve a consistent message.

### Static Response Generation: The Edge Safety Switch
In Lambda@Edge, you can construct a full HTTP response—including status code, headers, and a body—entirely in code. As a CloudFront Architect, this is your ultimate fallback mechanism for:
- **Maintenance Windows**: Show a branded "We'll be back soon" page that maintains brand trust during outages.
- **Custom Error Pages**: Standardize the user experience for 404s or 500s across all your origins (S3, APIs, Legacy servers).
- **Micro-frontends**: Serve common global components (like footers or meta-tags) directly from the Edge PoP.

### Body Limits
Keep in mind that responses generated at the edge have size limits (usually 1MB for the body). For a maintenance page, this is more than enough for a beautiful, self-contained HTML/CSS file.

> [!TIP]
> **Technical Reference**: For a detailed breakdown of the Lambda@Edge event JSON and the specific fields required to generate a response, see the [Lambda@Edge Event Structure Guide](../../commons/lambda-at-edge-event.md).

## 🎯 Your Goal
Intercept every request to return a 503 Service Unavailable status code, accompanied by a custom HTML body and the appropriate Content-Type header.
## 📝 Starter Code Template
```javascript
'use strict';

exports.hookType = 'viewer-request';

exports.handler = async (event) => {
    // TODO: Return a custom 503 response
    /*
    return {
        status: '503',
        statusDescription: 'Service Unavailable',
        body: '...'
    };
    */
};
```

## 🛠️ Instructions
1. Open `tutorial/module-3-edge/exercise-2/index.js`.
2. Return a custom response object.
3. Run the emulator:
   ```bash
   cloudfrontize www --edge ./tutorial/module-3-edge/exercise-2/index.js
   ```
4. Visit `http://localhost:3000/`.
## 🧪 How to Test

### 1. The Execution Journey (Visual Control Plane)
1.  Open the **WebUI**: `http://localhost:3001`
2.  Refresh `http://localhost:3000/`.
3.  In the **Real-time Edge Traffic** list, click the request row to expand the **Execution Journey**.
4.  **Fidelity Analysis**:
    - Select the **[L@E: viewer-request]** station. In the **State Inspector** panel, verify that the execution journey ends here (Short-Circuit) and that the status is `503`.
    - Select the **Body** tab in the State Inspector to audit the HTML source of your maintenance page.

## 💡 Fidelity Tip
When you return a response from `viewer-request`, the request **never** reaches your origin. This is perfect for maintenance modes or custom error pages that need to be globally consistent.

## 🎓 Learning More
- **AWS Reference**: [Generating a Static Response (AWS Docs)](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-examples.html#lambda-examples-generated-response-static)
- **Keywords**: `viewer-request static response`, `Edge Maintenance Page`, `Custom HTML from Lambda@Edge`.

---

> [!CAUTION]
> ### 🛑 Forensic Troubleshooting: Port 3000 Hangups
> If the emulator fails to start because "Port 3000 is already in use," it means a previous session didn't close properly. 
> 1. Run: `netstat -ano | findstr :3000` to find the PID.
> 2. Run: `taskkill /F /PID <PID_NUMBER>` to clear the ghost process.
