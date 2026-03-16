# Exercise 3.2: The A/B Router

## 🎭 The Scenario

Your marketing team wants to **test two versions of a landing page** without touching the origin server.

Using **CloudFront Functions**, you can perform **lightweight A/B routing at the edge**, sending some users to the original page and others to the test page.

This allows you to:

* Split traffic evenly
* Avoid origin changes
* Minimize latency by processing at the edge

---

## 🎯 Your Goal

Implement a **CloudFront Function** that:

* Checks for a cookie named:

```
ab_test_group
```

* Routes requests to:

```
/original-page   → if cookie = "A"
```

```
/test-page       → if cookie = "B"
```

* If the cookie is **missing**, assign the user randomly to **A** or **B** and set the cookie for future requests
* All other requests should continue normally

---

## 📝 Starter Code Template

```javascript
function handler(event) {

    var request = event.request;
    var headers = request.headers;

    // TODO:
    // 1. Check for "ab_test_group" cookie
    // 2. If present, route to /original-page or /test-page
    // 3. If missing, randomly assign "A" or "B" and set cookie
    // 4. Return request with updated URI and/or cookie

    return request;

}
```

---

## 🛠 Instructions

1. Create the exercise file:

```bash
tutorial/module-5-cff/advanced/viewer-request-ab-router.js
```

2. Implement the A/B routing logic inside the `handler()` function.

3. Start the CloudFrontize emulator:

```bash
cloudfrontize www --cff ./tutorial/module-5-cff/advanced/viewer-request-ab-router.js --debug
```

---

## 🧪 How to Test

### 1. Using a Browser

1. Open:

```
http://localhost:3000/
```

2. Inspect cookies using your browser developer tools:

* If the `ab_test_group` cookie is **A**, you should see `/original-page`
* If the cookie is **B**, you should see `/test-page`
* If no cookie exists, the function should set one randomly and route accordingly

3. Refresh the page to confirm that the same bucket is consistently served after the cookie is set.

---

### 2. Using `curl` with Cookies

```bash
# Simulate user with cookie A
curl -i -H "Cookie: ab_test_group=A" http://localhost:3000/

# Simulate user with cookie B
curl -i -H "Cookie: ab_test_group=B" http://localhost:3000/

# New user (no cookie)
curl -i http://localhost:3000/
```

---

## 💡 Fidelity Tip

CloudFront Functions run **before Lambda@Edge** and can:

* Read and modify cookies
* Change the request URI
* Short-circuit or redirect traffic

This enables **high-performance, low-latency A/B testing** globally, without adding origin load.

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
CloudFront Function A/B testing
viewer-request cookie routing
Edge traffic split
ab_test_group cookie
```

---
[⬅️ Back to Syllabus](../README.md)
