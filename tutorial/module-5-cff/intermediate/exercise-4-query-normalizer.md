# Exercise 1.4: The Query Normalizer

## 🎭 The Scenario

Your analytics team noticed that URLs to your site often include unnecessary tracking query parameters, such as:

```
?utm_source=google&utm_campaign=spring_sale
```

These parameters **pollute cache keys** and **increase cache misses**. To improve caching and clean URLs, you decide to **normalize query strings at the edge** using a CloudFront Function.

---

## 📖 The Lesson: Query String Fidelity

A major cause of low **Cache Hit Ratios** in production is "Query Parameter Pollution." Marketing trackers (like `utm_source`) create unique URLs for every visitor, even if the content is exactly the same.

### CFF Query Handling
In CloudFront Functions, the `request.querystring` is a structured object where each key represents a parameter. This makes normalization extremely fast and easy:

```javascript
// Input: ?id=123&utm_source=google
request.querystring = {
    "id": { value: "123" },
    "utm_source": { value: "google" }
};
```

By deleting the "tracking" keys from this object at the edge, you ensure that CloudFront's cache key is generated using only the **functional** parameters (like `id`).

---

## 🎯 Your Goal

Implement a **CloudFront Function** that performs forensic query normalization:

1.  **Identify**: Scan the `request.querystring` object for tracking parameters (`utm_source`, `utm_medium`, `utm_campaign`).
2.  **Strip**: Remove these parameters while preserving all others.
3.  **Optimize**: Pass the cleaned request forward to ensure high cache hit fidelity.

> [!IMPORTANT]
> ### 🛑 The CFF Contract: ES5.1 Syntax Only
> CloudFront Functions execute in a specialized V8 sandbox that only supports **ECMAScript 5.1**. 
> 1. **No `const` or `let`**: You must use `var` for all variable declarations.
> 2. **No `Object.keys()`**: This ES6 method is not available. Use `for (var key in obj)` instead.
> 3. **No `.includes()`**: Use `indexOf(search) !== -1` for string/array checks.

---

## 📝 Starter Code Template

```javascript
function handler(event) {

    var request = event.request;

    // TODO:
    // Normalize query string by removing tracking parameters
    // Example: "?utm_source=google&utm_campaign=spring_sale&id=123"
    // becomes "?id=123"

    return request;

}
```

---

## 🛠 Instructions

1. Create the exercise file:

```
tutorial/module-5-cff/intermediate/viewer-request-query-normalizer.js
```

2. Implement the query normalization logic inside the `handler()` function.

3. Start the CloudFrontize emulator:

```bash
cloudfrontize www --cff ./tutorial/module-5-cff/intermediate/viewer-request-query-normalizer.js --debug --mode website
```

---

## 🧪 How to Test

### 1. The Execution Journey (Visual Control Plane)
Your browser will always show the full URL it sent. To see the "Normalized" URL that CloudFront actually used for the cache lookup, use the **WebUI**:

1.  Open the **WebUI**: `http://localhost:3001`
2.  Trigger a request with tracking params: `http://localhost:3000/products?utm_source=google&id=123`
3.  In the **Real-time Edge Traffic** list, click the request row to expand the **Execution Journey**.
4.  In the journey tree, click the **[CFF: viewer-request]** station.
5.  In the **State Inspector** panel, verify that the **Header Snapshots** (and URI state) show that `utm_source` has been stripped.

### 2. Terminal Audit
If running with `--debug`, the emulator will log the internal rewrite:
`REWRITE: /products?utm_source=google&id=123 -> /products?id=123`

---

## 💡 Fidelity Tip

CloudFront Functions can **manipulate query strings** before the request reaches your origin.

This technique is useful for:

* Improving cache hit rates by removing unnecessary parameters
* Implementing global URL normalization
* Stripping sensitive or tracking data from requests

Because the processing happens **at the edge**, the performance impact is minimal, and changes apply globally across all edge locations.

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
`CloudFront Function query normalization`, `viewer-request query strip`, `Edge query string cleaning`, `utm parameter removal`

---

> [!CAUTION]
> ### 🛑 Forensic Troubleshooting: Port 3000 Hangups
> If the emulator fails to start because "Port 3000 is already in use," it means a previous session didn't close properly. 
> 1. Run: `netstat -ano | findstr :3000` to find the PID.
> 2. Run: `taskkill /F /PID <PID_NUMBER>` to clear the ghost process.

---
[⬅️ Back to Syllabus](../README.md)
