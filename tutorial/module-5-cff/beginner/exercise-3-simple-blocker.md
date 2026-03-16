# Exercise 1.3: The Simple Blocker

## 🎭 The Scenario

Your site has a sensitive administration section under:

```
/admin
```

To improve security and reduce unauthorized access, you want to **block all requests** to this path **directly at the edge**, before they ever reach your origin server.

This prevents accidental exposure and saves backend resources by stopping unwanted traffic early.

---

## 🎯 Your Goal

Implement a **CloudFront Function** that:

* detects requests to `/admin`
* returns a **403 Forbidden** response
* stops the request from reaching the origin

All other requests should continue normally.

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
