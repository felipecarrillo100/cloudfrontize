# Exercise 1.3: The Simple Blocker

## 🎭 The Scenario

Your site has a sensitive administration section under:

```
/admin
```

To improve security and reduce unauthorized access, you want to **block all requests** to this path **directly at the edge**, before they ever reach your origin server.

This prevents accidental exposure and saves backend resources by stopping unwanted traffic early.

---

## 📖 The Lesson: Short-Circuiting the Edge

In a standard CDN flow, a request travels through several layers before hitting the origin. However, CloudFront Functions allow you to **short-circuit** this journey.

### Generating Responses at the Edge
If your function returns an object with `statusCode` (and optionally `statusDescription`, `headers`, and `body`), CloudFront immediately generates that response and sends it back to the viewer.
- **Bypass Cache**: The request never checks the CloudFront cache.
- **Bypass Lambda@Edge**: Downstream L@E functions are never executed.
- **Bypass Origin**: Your backend remains isolated and protected.

This is the most secure and performance-efficient way to implement **Access Control Lists (ACLs)** or simple IP/path blocking.

---

## 🎯 Your Goal

Implement a **CloudFront Function** that performs a forensic block:

1.  **Identify**: Detect incoming requests to any path starting with `/admin`.
2.  **Short-Circuit**: Return a custom response object with `statusCode: 403`.
3.  **Sanitize**: Ensure no headers from the original request are leaked in the blocked response.

> [!IMPORTANT]
> ### 🛑 The CFF Contract: Avoid the "Silent Failure"
> CloudFront Functions use a strictly different response object than Lambda@Edge. 
> 1. **Status Code**: Use `statusCode: 403` (number), NOT `status: '403'` (string).
> 2. **Status Description**: Always include `statusDescription: "Forbidden"`.
> 3. **Syntax**: CFF only supports **ECMAScript 5.1**. You must use `var`, not `const` or `let`.

---

## 📝 Starter Code Template

```javascript
function handler(event) {

    var request = event.request;
    var uri = request.uri;

    // TODO:
    // If the request URI is "/admin",
    // return a 403 Forbidden response

    return request;

}
```

---

## 🛠 Instructions

1. Create the exercise file:

```
tutorial/module-5-cff/beginner/viewer-request-blocker.js
```

2. Implement the blocking logic inside the `handler()` function.

3. Start the CloudFrontize emulator:

```bash
cloudfrontize www --cff ./tutorial/module-5-cff/beginner/viewer-request-blocker.js
```

---

## 🧪 How to Test

### 1. The Execution Journey (Visual Control Plane)
A `403 Forbidden` response is a classic "Short-Circuit." Use the **WebUI** to confirm the request never touched the origin:

1.  Open the **WebUI**: `http://localhost:3001`
2.  Visit the forbidden path: `http://localhost:3000/admin`
3.  In the **Real-time Edge Traffic** list, click the request row to expand the **Execution Journey**.
4.  In the journey tree, click the **[CFF: viewer-request]** station.
5.  In the **State Inspector** panel, verify that the execution journey ends here (Short-Circuit) and that the status is `403`.
6.  Check the **Origin Fetch** stage: It should be **skipped**.

### 3. Using `curl`
`curl -v http://localhost:3000/admin`
Check for `HTTP/1.1 403 Forbidden`.

---

## 💡 Fidelity Tip

CloudFront Functions can **short-circuit requests** at the edge. Common use cases:

* Access control
* Bot blocking
* Rate limiting
* Lightweight security enforcement

Blocking at the edge improves both **performance** and **security** since requests never reach the origin server.

| Limit          | Value                       |
| -------------- | --------------------------- |
| Code size      | 10 KB                       |
| Execution time | ~1 ms                       |
| Runtime        | JavaScript (ECMAScript 5.1) |

---

## 🎓 Learning More
**AWS Documentation**
[https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-functions.html](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-functions.html)

**Keywords**
`CloudFront Function access control`, `viewer-request block`, `Edge request blocking`, `403 Forbidden at edge`

---

> [!CAUTION]
> ### 🛑 Forensic Troubleshooting: Port 3000 Hangups
> If the emulator fails to start because "Port 3000 is already in use," it means a previous session didn't close properly. 
> 1. Run: `netstat -ano | findstr :3000` to find the PID.
> 2. Run: `taskkill /F /PID <PID_NUMBER>` to clear the ghost process.

[⬅️ Back to Syllabus](../README.md)
