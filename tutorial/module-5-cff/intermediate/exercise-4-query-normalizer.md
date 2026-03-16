# Exercise 1.4: The Query Normalizer

## 🎭 The Scenario

Your analytics team noticed that URLs to your site often include unnecessary tracking query parameters, such as:

```
?utm_source=google&utm_campaign=spring_sale
```

These parameters **pollute cache keys** and **increase cache misses**. To improve caching and clean URLs, you decide to **normalize query strings at the edge** using a CloudFront Function.

---

## 🎯 Your Goal

Implement a **CloudFront Function** that:

* removes tracking query parameters (`utm_source`, `utm_medium`, `utm_campaign`, etc.)
* leaves all other query parameters intact
* passes the cleaned request to the origin or downstream processing

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
cloudfrontize www --cff ./tutorial-cff/intermediate/viewer-request-query-normalizer.js --debug --mode website
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
