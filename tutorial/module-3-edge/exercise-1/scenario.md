# Exercise 3.1: The Bouncer

## 🎭 The Scenario
Your `/admin/` dashboard is currently public. You need to add a quick layer of security using Basic Auth, but you don't want to modify your backend code.

## 📖 The Lesson: Security and Short-Circuiting

When you need to protect a specific path (like `/`  or `/admin/` or other), you don't always need to change your application code. You can use a `viewer-request` hook to act as a **Bouncer**.

### The Magic of Short-Circuiting: The Architect's First Line of Defense
If your Lambda@Edge function returns a `response` object instead of the `request` object, CloudFront immediately sends that response back to the user. As an Architect, this "short-circuit" is your most powerful tool for:
1.  **Protecting Backend Resources**: Unauthorized users, scrapers, or malicious bots never touch your database or application servers.
2.  **Global Security Enforcement**: Your security policy is enforced at the edge, milliseconds away from the user, before the request ever crosses the global network to your origin.

### Basic Auth Mechanics
Basic Auth is a simple challenge-response protocol. If the user doesn't provide credentials, we send a `401 Unauthorized` with a `WWW-Authenticate` header. The browser then shows a login prompt and sends the credentials back in an `Authorization` header.

> [!TIP]
> **Technical Reference**: For a detailed breakdown of the Lambda@Edge event JSON and how to generate a custom response, see the [Lambda@Edge Event Structure Guide](../../commons/lambda-at-edge-event.md).

## 🎯 Your Goal
Verify the user's authentication by checking the Authorization header. If the header is missing or contains invalid credentials, return a 401 Unauthorized response directly from the Edge.

Consequently, the browser will trigger a login prompt when a user visits /, granting access only once valid credentials are provided.
## 📝 Starter Code Template
```javascript
'use strict';

exports.hookType = 'viewer-request';

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    const headers = request.headers;

    // TODO: Implement Basic Auth check
    // const auth = headers.authorization ? ...

    return request;
};
```

## 🛠️ Instructions
1. Open `tutorial/module-3-edge/exercise-1/index.js`.
2. Implement the `Authorization` check.
3. Run the emulator:
   ```bash
   cloudfrontize www --edge ./tutorial/module-3-edge/exercise-1/index.js
   ```
4. Visit `http://localhost:3000/`.
## 🧪 How to Test

### 1. The Execution Journey (Visual Control Plane)
1.  Open the **WebUI**: `http://localhost:3001`
2.  Refresh `http://localhost:3000/`.
3.  In the **Real-time Edge Traffic** list, click the request row to expand the **Execution Journey**.
4.  **Fidelity Analysis**:
    - Select the **[L@E: viewer-request]** station. In the **State Inspector**, verify that the execution journey ends here (Short-Circuit) and that the status is `401`.
    - Select the **Terminal Response** node. In the **Header Snapshots**, verify the presence of the `WWW-Authenticate` header.

---
## 🧠 Pro-Knowledge: How Basic Auth Works

When you use Basic Auth, the browser doesn't send your password in "plain text," but it doesn't encrypt it either. It uses **Base64 Encoding**.

1. **Concatenation**: The browser joins the username and password with a colon: `admin:password`.
2. **Encoding**: It turns that string into Base64: `YWRtaW46cGFzc3dvcmQ=`.
3. **Header**: It sends it as `Authorization: Basic YWRtaW46cGFzc3dvcmQ=`.

> **⚠️ Security Warning**: This code snippet is only for educational purposes. A more realistic use case would check the username:password against a DB such as Dynamo. Because Base64 can be easily decoded by anyone, **Basic Auth must only be used over HTTPS**. Without SSL/TLS, your "Bouncer" is handing out the keys to anyone with a packet sniffer.

---
## 💡 Fidelity Tip: Node.js Buffers

Lambda@Edge (Node.js), the browser's btoa() function is unavailable. Instead, use Buffer.from(str).toString('base64'), which is the standard for handling encoded data at the Edge.

To ensure environment fidelity, the `cloudfrontize` emulator will crash if you use btoa, mirroring exactly how a production AWS environment would fail.


## 💡 Fidelity Tip: Body limit
Lambda@Edge functions have strict limits on response generation. For example, the `body` cannot exceed 1MB. Our emulator enforces these limits in `--strict` mode to prepare you for production!

## 🎓 Learning More
- **AWS Reference**: [Lambda@Edge General Use Cases (AWS Docs)](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-examples.html#lambda-examples-general-use-cases)
- **Keywords**: `viewer-request authentication`, `401 Unauthorized Edge`, `Lambda@Edge short-circuiting`.

---

> [!CAUTION]
> ### 🛑 Forensic Troubleshooting: Port 3000 Hangups
> If the emulator fails to start because "Port 3000 is already in use," it means a previous session didn't close properly. 
> 1. Run: `netstat -ano | findstr :3000` to find the PID.
> 2. Run: `taskkill /F /PID <PID_NUMBER>` to clear the ghost process.
