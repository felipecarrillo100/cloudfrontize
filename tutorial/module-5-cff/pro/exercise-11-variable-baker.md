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

### 1. The Forensic Trace (Web UI)
1.  Open the Web UI: `http://localhost:3001`
2.  Visit any page: `http://localhost:3000/`
3.  In the **Timeline**, click the request.
4.  **Logs**: Check for the message `[CFF: Baker] Strict Mode Active`.
5.  **Diagnostic Identity**: Click the Viewer Request node. Inspect the code to see that `__SECURITY_MODE__` has been replaced by `"strict"`.

### 2. Metric Monitoring
Baking happens **before** execution. Notice that there is **zero performance penalty** at runtime because the variable is hardcoded in the final JS sandbox.

---

## 💡 Fidelity Tip
In professional CI/CD pipelines, you would keep one source file and different `.variables` files for each environment (e.g., `prod.variables`, `staging.variables`). CloudFrontize ensures that your local development environment perfectly mirrors this production deployment workflow.

---
[⬅️ Back to Syllabus](../README.md)
