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

> [!TIP]
> **Forensic Hint**: When a request is blocked, use the **Dashboard Timeline** to verify that no "Origin Request" or "Origin Response" stages occurred. A successful short-circuit should show the request stopping at the "Viewer Request" stage.

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

### 1. Using your browser

1. Open:

```
http://localhost:3000/admin
```

2. You should see a **403 Forbidden** page, confirming that the request was blocked at the edge.

3. Test other URLs (e.g., `/index.html`) to confirm they continue normally.

---

### 2. Using `curl` (terminal verification)

```bash
curl -v -I http://localhost:3000/admin
```

* Expected output includes:

```
HTTP/1.1 403 Forbidden
```

* Confirm that no content from the origin is returned.

---

### 3. Optional: Check request logging

* If running the emulator with `-d`, inspect the logs for the blocked request.
* You should see a short-circuit response triggered for `/admin`.

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

```
CloudFront Function access control
viewer-request block
Edge request blocking
403 Forbidden at edge
```

[⬅️ Back to Syllabus](../README.md)
