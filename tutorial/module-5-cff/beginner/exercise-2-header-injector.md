# Exercise 1.2: The Header Injector

## 🎭 The Scenario

Your security team wants to verify that all traffic to your site is passing through **CloudFront edge logic**.

To make this visible during testing and debugging, they ask you to inject a **custom HTTP header** into every request processed at the edge.

This header will allow developers and operations teams to quickly confirm that **CloudFront Functions are executing correctly**.

---

## 🎯 Your Goal

Implement a **CloudFront Function** that:

* adds a custom header named:

```
x-edge-powered-by
```

* sets its value to:

```
cloudfrontize
```

The header should be injected into the request **before it continues through the CloudFront pipeline**.

All other request properties should remain unchanged.

---

## 📝 Starter Code Template

```javascript
function handler(event) {

    var request = event.request;

    // TODO:
    // Add a custom header "x-edge-powered-by"
    // with value "cloudfrontize"

    return request;

}
```

---

## 🛠 Instructions

1. Create the exercise file:

```
tutorial/module-5-cff/beginner/viewer-request-header.js
```

2. Modify the `request` object to include the custom header.

3. Start the CloudFrontize emulator:

```bash
cloudfrontize www --cff ./tutorial/module-5-cff/beginner/viewer-request-header.js --debug
```

---

## 🧪 How to Test

### 1. Using your browser

Open:

```
http://localhost:3000
```

* Open **Developer Tools → Network tab**
* Reload the page
* Click any request (e.g., `/index.html`)
* Confirm the request **includes the header**:

```
x-edge-powered-by: cloudfrontize
```

### 2. Using `curl` (terminal verification)

```bash
curl -I http://localhost:3000
```

* Look for the header in the response 
* Expected header:

```
x-edge-powered-by: cloudfrontize
```

### 3. Optional: Verify origin is untouched

* Ensure the original request properties (URI, method) remain the same.
* Only the **new header** is added at the edge.

---

## 💡 Fidelity Tip

CloudFront Functions can **modify request headers** before the request reaches your origin server.

Common use cases:

* Feature flags
* Debugging markers
* Request tracing
* Custom cache key behavior
* Security tagging

Because the modification happens **at the edge**, it applies globally across all CloudFront locations.

Remember the limits:

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
CloudFront Function headers
Edge request header injection
viewer-request header modification
```

---

[⬅️ Back to Syllabus](../README.md)
