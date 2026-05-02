# Exercise 1.11: The Variable Baker (Pro)

## 🎭 The Scenario

Just like Lambda@Edge, **CloudFront Functions do not support environment variables**. This makes it difficult to manage different configurations (like API endpoints, feature flags, or debug modes) between `development`, `staging`, and `production` environments.

## 📖 The Lesson: Build-Time Injection (Baking)

Because CFF code must be ultra-low-latency and is cached globally, AWS does not allow runtime lookups of environment variables. 

To solve this, we use the **Baking Pattern**:
1.  **Placeholders**: In your code, use double-underscore tokens like `__API_KEY__`.
2.  **Baking**: During the build/startup phase, CloudFrontize replaces these tokens with real values from a `.variables` file.

This creates a "Production Ready" JS file with hardcoded values, which is exactly what CFF expects for maximum performance.

---

> [!IMPORTANT]
> ### 🛑 The CFF Contract: ES5.1 & The 10KB Limit
> CloudFront Functions execute in a specialized V8 sandbox that only supports **ECMAScript 5.1**. 
> 1. **No `const` or `let`**: You must use `var` for all variable declarations.
> 2. **The 10KB Limit**: Every baked character counts towards your 10KB limit. If you bake large JSON strings or configurations, ensure you monitor the **KB Counter** in the `CodeViewer`.
> 3. **Zero Runtime Latency**: Baking is a build-time operation. It provides the same performance as hardcoded values because, in the final sandbox, they *are* hardcoded.

---

## 🎯 Your Goal

Implement a CFF function that uses a **baked variable** to control a security header:

1.  **Identify**: Use the token `__SECURITY_MODE__` in your code.
2.  **Logic**: If the mode is `strict`, add a `Content-Security-Policy` header.
3.  **Bake**: Launch the emulator using a `.variables` file to set the mode to `strict`.

---

## 📝 Starter Code Template

```javascript
function handler(event) {
    var request = event.request;
    
    // 🍞 BAKE PLACEHOLDER
    var MODE = "__SECURITY_MODE__";

    if (MODE === "strict") {
        console.log("[CFF: Baker] Strict Mode Active");
        request.headers['content-security-policy'] = { value: "default-src 'self'" };
    } else {
        console.log("[CFF: Baker] Standard Mode Active: " + MODE);
    }

    return request;
}
```

---

## 🛠️ Instructions

1. Create the exercise file:
   `tutorial/module-5-cff/pro/viewer-request-baker.js`

2. Create a variables file:
   `tutorial/module-5-cff/pro/baker.variables`
   ```env
   SECURITY_MODE=strict
   ```

3. Start the CloudFrontize emulator with the `--bake` flag:
   ```bash
   cloudfrontize www --cff ./tutorial/module-5-cff/pro/viewer-request-baker.js --bake ./tutorial/module-5-cff/pro/baker.variables --debug
   ```

---

## 🧪 How to Test

### 1. The Execution Journey (Visual Control Plane)
1.  Open the **WebUI**: `http://localhost:3001`
2.  Trigger a request: `http://localhost:3000/`
3.  **Source Audit**:
    - On the **Fidelity Cloud** highway, **Right-click** the blue **[CFF: viewer-request]** station.
    - Select **View Source**. Notice that the live running code now has the real value (`"strict"`) instead of the placeholder `__SECURITY_MODE__`.
4.  **Header Snapshots**:
    - In the **Real-time Edge Traffic** list, click the request row to expand the **Execution Journey**.
    - Click the **[CFF: viewer-request]** station.
    - In the **State Inspector** panel, verify that the **Header Snapshots** show the `content-security-policy` header.

### 2. Metric Monitoring
Baking happens **before** execution. Notice that there is **zero performance penalty** at runtime because the variable is hardcoded in the final JS sandbox.

---

## 🎓 Learning More
**AWS Documentation**
[https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-functions.html](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-functions.html)

**Keywords**
`CloudFront Function variables`, `CFF build-time injection`, `Edge configuration baking`

---

> [!CAUTION]
> ### 🛑 Forensic Troubleshooting: Port 3000 Hangups
> If the emulator fails to start because "Port 3000 is already in use," it means a previous session didn't close properly. 
> 1. Run: `netstat -ano | findstr :3000` to find the PID.
> 2. Run: `taskkill /F /PID <PID_NUMBER>` to clear the ghost process.
[⬅️ Back to Syllabus](../README.md)
