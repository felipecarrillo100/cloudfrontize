# Exercise 3.2: The A/B Router

## 🎭 The Scenario

Your marketing team wants to **test two versions of a landing page** without touching the origin server.

Using **CloudFront Functions**, you can perform **lightweight A/B routing at the edge**, sending some users to the original page and others to the test page.

This allows you to:

* Split traffic evenly
* Avoid origin changes
* Minimize latency by processing at the edge

---

## 📖 The Lesson: The Cookie Context

In CloudFront Functions, cookies are parsed into a dedicated `request.cookies` object. This saves you from having to manually parse the `Cookie` header string using complex regex.

### Structure of `request.cookies`
Similar to headers, cookies are structured as objects:
```javascript
cookies: {
    "ab_test_group": { value: "A" }
}
```

### Sticky Routing
A common pattern for A/B testing is **"Sticky Routing."** 
1.  **Check**: If the user already has a bucket cookie, use it.
2.  **Assign**: If not, use `Math.random()` to assign them to a bucket.
3.  **Persistence**: CloudFront Functions can modify the response to set the cookie for future requests, but in this exercise, we focus on **Request-side Routing**.

---

## 🎯 Your Goal

Implement a **CloudFront Function** that performs forensic A/B routing:

1.  **Bucket Check**: Read the `ab_test_group` cookie from `request.cookies`.
2.  **Logic**:
    - If "A": Internally rewrite the URI to `/original-page`.
    - If "B": Internally rewrite the URI to `/test-page`.
3.  **Randomize**: If the cookie is missing, assign the user to a bucket and return the request.

> [!TIP]
> **Forensic Hint**: Use the **KB Counter** to ensure your randomization logic doesn't bloat the script. CFF has a strict **10KB limit**—every line of logic counts when you start adding complex bucket weights.

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
