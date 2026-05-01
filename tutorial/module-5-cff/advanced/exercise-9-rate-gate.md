# Exercise 3.4: The Rate Gate

## 🎭 The Scenario

Your site needs to **protect critical endpoints** from excessive requests that could affect performance or availability.

Rather than implementing rate-limiting on your origin server, you can use **CloudFront Functions** to enforce **lightweight request gating** at the edge.

This reduces origin load and ensures **early request rejection**, improving both security and performance.

---

## 📖 The Lesson: The 1ms Wall

CloudFront Functions are built on a highly optimized, but restricted, version of the V8 engine. Unlike standard Node.js or Lambda@Edge, you have a strict **~1ms CPU time limit**.

### Why the limit?
CFF runs on the "Hot Path" of the request. To handle millions of requests per second without introducing latency, AWS restricts the runtime:
- **No Async/Await**: You cannot perform network calls or file system operations.
- **No Promises**: Everything must be synchronous.
- **Minimal Standard Library**: Only basic ES5.1 features are available.

If your code takes more than 1ms to execute, CloudFront will terminate it and return a 502 error to the user. This is why CFF is best used for simple logic like header manipulation and URI rewrites.

---

## 🎯 Your Goal

Implement a **CloudFront Function** that performs forensic rate-gating:

1.  **Extract**: Read a client-provided header (e.g., `x-request-count`).
2.  **Validate**: Convert the value to a number.
3.  **Threshold**: If the count exceeds 100, return a **429 Too Many Requests** response.
4.  **Audit**: Ensure the response includes a body explaining the rejection.

> [!TIP]
> **Forensic Hint**: The CloudFrontize simulator actually **times your execution**. If your logic is too complex, you will see a warning in the console: `⚠️ [CFF] exceeded 1ms CPU limit`. Use the **Performance** metrics in the dashboard to optimize your code.

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

---

## 🧪 How to Test

### 1. The Forensic Trace (Web UI)
A `429 Too Many Requests` is a defensive "Short-Circuit." Verify the blockage visually:

1.  Open the Web UI: `http://localhost:3001`
2.  Trigger a blocked request:
    `curl -I -H "x-request-count: 101" http://localhost:3000/`
3.  In the **Timeline**, click the request.
4.  Verify the **Stage Trace** ends at the **Viewer Request** stage.
5.  Check the **Logs** tab to see the `Rate Limit Blocked: 101` message.

### 2. Performance Profiling
1.  In the Dashboard, locate the **Viewer Request** node.
2.  Check the **Execution Time**: Parsing headers and performing integer comparison is extremely fast. Confirm it is well below the 1ms budget.

### 3. Verification with `curl`
`curl -v -H "x-request-count: 50" http://localhost:3000/` -> **200 OK**
`curl -v -H "x-request-count: 150" http://localhost:3000/` -> **429 Too Many Requests**

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
