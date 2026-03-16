# Exercise 3.4: The Rate Gate

## 🎭 The Scenario

Your site needs to **protect critical endpoints** from excessive requests that could affect performance or availability.

Rather than implementing rate-limiting on your origin server, you can use **CloudFront Functions** to enforce **lightweight request gating** at the edge.

This reduces origin load and ensures **early request rejection**, improving both security and performance.

---

## 🎯 Your Goal

Implement a **CloudFront Function** that:

* Tracks a simple request count per client using a **custom header** (for demo/testing purposes)
* Blocks further requests if a **threshold is exceeded**
* Returns a **429 Too Many Requests** response when the limit is hit
* Allows normal traffic if under the threshold

> ⚠️ Note: This is a **basic edge simulation**. Full production rate-limiting typically requires a **centralized store** like DynamoDB, Redis, or CloudFront + WAF.

---

## 📝 Starter Code Template

```javascript
function handler(event) {

    var request = event.request;
    var headers = request.headers;

    // TODO:
    // Implement a simple rate-gate
    // Example approach:
    // - Read a header like "x-request-count"
    // - Increment the value in your curl request
    // - If above threshold, return 429 response
    // - Otherwise, pass the request through

    return request;

}
```

---

## 🛠 Instructions

1. Create the exercise file:

```bash
tutorial/module-5-cff/advanced/viewer-request-rate-gate.js
```

2. Implement the **rate-gating logic** inside the `handler()` function.

3. Start the CloudFrontize emulator:

```bash
cloudfrontize www --cff ./tutorial/module-5-cff/advanced/viewer-request-rate-gate.js
```

4. Simulate multiple requests and inspect the **response code** and **headers**.

    The limit is threshold is set to 100.  

**Below limit**: When counter is 2 you are under the threshold (Should work):

```bash
curl -v -I -H "x-request-count: 2" http://localhost:3000/
```

* **Result:** `200 OK`. The page content is returned.

**Below limit**: When counter is 101 you are above the threshold (Should block):**

```bash
curl -v -I -H "x-request-count: 101" http://localhost:3000/
```

* **Result:** `429 Too Many Requests`.
* **Body:** "Rate limit exceeded. Please slow down."

---

## 💡 Fidelity Tip

CloudFront Functions can **short-circuit requests at the edge** for lightweight request validation.

This technique is commonly used for:

* Rate limiting
* Bot mitigation
* Lightweight abuse prevention
* Early rejection of invalid requests

> Because the logic executes **before reaching your origin**, you save both bandwidth and backend resources.

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
CloudFront Function rate limiting
viewer-request throttling
Edge request gating
429 Too Many Requests
```

---
[⬅️ Back to Syllabus](../README.md)
