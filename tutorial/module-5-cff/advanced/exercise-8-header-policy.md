# Exercise 3.3: The Header Policy

## 🎭 The Scenario

Your security team wants to ensure all requests **adhere to strict security standards** before they reach your origin.

Using **CloudFront Functions**, you can **inject or enforce HTTP security headers** at the edge. This approach improves **performance, compliance, and safety**, and reduces the need for origin server modifications.

Typical security headers include:

* `Strict-Transport-Security`
* `X-Content-Type-Options`
* `X-Frame-Options`
* `Content-Security-Policy`
* `Referrer-Policy`

---

## 📖 The Lesson: Secure by Default

Security headers like `HSTS`, `Content-Security-Policy` (CSP), and `X-Frame-Options` are critical for protecting your users. While you can set them at your origin server, setting them at the edge is more robust.

### The Edge Advantage
- **Origin Independence**: If you have multiple origins (S3, EC2, API Gateway), you don't have to configure security headers on each one. CFF applies them globally.
- **Protocol Enforcement**: You can use CFF to ensure that `Strict-Transport-Security` is injected even if the origin accidentally omits it.
- **Latency**: Headers are injected at the edge location nearest to the user, ensuring the browser receives them as quickly as possible.

In this exercise, you will enforce a global security policy by injecting five mandatory headers into every request.

---

## 🎯 Your Goal

Implement a **CloudFront Function** that performs forensic security enforcement:

1.  **Target**: Loop through or explicitly set five security headers: `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy`, and `Referrer-Policy`.
2.  **Standardize**: Use the correct CloudFront `{ value: "..." }` object format.
3.  **Validate**: Ensure all header keys are **lowercase** to meet CFF engine requirements.

> [!IMPORTANT]
> ### 🛑 The CFF Contract: ES5.1 & Lowercase Keys
> CloudFront Functions execute in a specialized V8 sandbox that only supports **ECMAScript 5.1**. 
> 1. **No `const` or `let`**: You must use `var` for all variable declarations.
> 2. **Lowercase Only**: Header keys must be **lowercase** in your code (e.g., `x-frame-options`). If you use mixed case, CloudFront will fail to recognize them.
> 3. **The Object Pattern**: Always use the `{ value: "..." }` structure for header values.

---

### ⚠️ Note: CloudFront Functions (CFF) Header Structure

Unlike **Lambda@Edge**, which uses an "Array of Objects" for headers, **CloudFront Functions** uses a high-performance **Flat Object** map.

* **CFF Format:** `headers['name'] = { value: '...' }`
* **Requirement:** Keys must be **lowercase** in your code (e.g., `x-frame-options`).

| Engine | Header Data Structure |
| --- | --- |
| **CFF** | `{"header-name": { "value": "..." }}` |
| **Lambda@Edge** | `{"header-name": [{ "key": "Header-Name", "value": "..." }]}` |

---
---

## 📝 Starter Code Template

```javascript
function handler(event) {

    var request = event.request;
    var headers = request.headers;

    // TODO:
    // Inject the security headers:
    // "Strict-Transport-Security", "X-Content-Type-Options",
    // "X-Frame-Options", "Content-Security-Policy", "Referrer-Policy"

    return request;

}
```

---

## 🛠 Instructions

1. Create the exercise file:

```bash
tutorial/module-5-cff/advanced/viewer-request-header-policy.js
```

2. Implement the logic to inject the security headers inside the `handler()` function.

3. Start the CloudFrontize emulator:

```bash
cloudfrontize www --cff ./tutorial/module-5-cff/advanced/viewer-request-header-policy.js --debug
```

4. Open your browser and visit:

```
http://localhost:3000
```

5. Inspect the request headers using **browser developer tools** or server logs to confirm that all security headers are present.

---

## 💡 Fidelity Tip

CloudFront Functions can **modify or add request headers** without contacting the origin.

This pattern is commonly used for:

* Enforcing security policies
* Preventing clickjacking
* Blocking content-type sniffing
* Applying consistent security rules globally across all edge locations

Because the modification happens **at the edge**, it ensures **low latency and high performance** while enforcing standards.

| Limit          | Value                       |
| -------------- | --------------------------- |
| Code size      | 10 KB                       |
| Execution time | ~1 ms                       |
| Runtime        | JavaScript (ECMAScript 5.1) |

---

## 🧪 How to Test

### 1. The Execution Journey (Visual Control Plane)
As these are `viewer-request` injections, they are applied to the request **on the way to the origin**. You won't see them in your browser's Request Headers. You must use the **WebUI** to perform a forensic audit:

1.  Open the **WebUI**: `http://localhost:3001`
2.  Trigger a request: `curl http://localhost:3000`
3.  In the **Real-time Edge Traffic** list, click the request row to expand the **Execution Journey**.
4.  In the journey tree, click the **[CFF: viewer-request]** station.
5.  In the **State Inspector** panel, verify that the **Header Snapshots** show all 5 security headers present.

---

## 🎓 Learning More
**AWS Documentation**
[https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-functions.html](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-functions.html)

**Keywords**
`CloudFront Function security headers`, `viewer-request security enforcement`, `Edge header injection`, `CSP X-Frame-Options HSTS`

---

> [!CAUTION]
> ### 🛑 Forensic Troubleshooting: Port 3000 Hangups
> If the emulator fails to start because "Port 3000 is already in use," it means a previous session didn't close properly. 
> 1. Run: `netstat -ano | findstr :3000` to find the PID.
> 2. Run: `taskkill /F /PID <PID_NUMBER>` to clear the ghost process.

---
[⬅️ Back to Syllabus](../README.md)
