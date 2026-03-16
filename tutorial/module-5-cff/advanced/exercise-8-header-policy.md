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

## 🎯 Your Goal

Implement a **CloudFront Function** that:

* Adds the following headers to **all requests/responses**:

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Content-Security-Policy: default-src 'self'
Referrer-Policy: same-origin
```

* Ensures the headers are injected **before the request reaches your origin**
* Preserves any existing headers already present in the request
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

### 1. Using a Browser

1. Open:

```
http://localhost:3000
```

2. Open developer tools → **Network tab**.
3. Inspect the request headers (or response headers if you adapt for `viewer-response`) to confirm that all security headers are present.

### 2. Using `curl`

```bash
curl -i http://localhost:3000
```

Check for headers:

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Content-Security-Policy: default-src 'self'
Referrer-Policy: same-origin
```

---

## 🎓 Learning More

**AWS Documentation**

[https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-functions.html](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-functions.html)

**Keywords**

```
CloudFront Function security headers
viewer-request security enforcement
Edge header injection
CSP X-Frame-Options HSTS
```

---
[⬅️ Back to Syllabus](../README.md)
