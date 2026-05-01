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

> [!TIP]
> **Forensic Hint**: CloudFrontize detects **Policy Violations**. Ensure you don't use modern ES6 methods like `Object.keys()` or `.includes()` to iterate through the query string. Use a standard `for...in` loop instead to avoid a **Build Error**.

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

### 1. Using your browser

1. Open a URL with tracking parameters:

```
http://localhost:3000/products?utm_source=google&utm_campaign=spring_sale&id=123
```

2. Inspect the request using **browser developer tools**.
   You should see that the request sent to the origin has the **tracking parameters removed**, leaving only:

```
[Debug] Website mode directory rewrite: /products?id=123 -> /products/index.html
[Debug] Mode: website, isRestMode: false, URL: /products/index.html?id=123, FullPath: D:\antigravity\cloudfrontize\www\products
```

3. Other query parameters not in the tracking list should remain untouched.

---

### 2. Using `curl` (terminal verification)

```bash
curl -i "http://localhost:3000/products?utm_source=google&utm_campaign=spring_sale&id=123"
```

* Confirm that the request received by the origin (or logged in the emulator) shows only the non-tracking query parameters:

```
[Debug] Website mode directory rewrite: /products?id=123 -> /products/index.html
[Debug] Mode: website, isRestMode: false, URL: /products/index.html?id=123, FullPath: D:\antigravity\cloudfrontize\www\products
```

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

```
CloudFront Function query normalization
viewer-request query strip
Edge query string cleaning
utm parameter removal
```

---
[⬅️ Back to Syllabus](../README.md)
