# Exercise 1.2: The Header Injector

## 🎭 The Scenario

Your security team wants to verify that all traffic to your site is passing through **CloudFront edge logic**.

To make this visible during testing and debugging, they ask you to inject a **custom HTTP header** into every request processed at the edge.

This header will allow developers and operations teams to quickly confirm that **CloudFront Functions are executing correctly**.

---

## 📖 The Lesson: The Header Object Pattern

In CloudFront Functions, headers are not just simple string pairs. They follow a specific object pattern that reflects the internal CloudFront infrastructure.

### The Structure
Each header in the `request.headers` object is a key where the value is an object containing a `value` property:

```javascript
headers: {
    "x-custom-header": { value: "my-value" },
    "content-type": { value: "text/html" }
}
```

### Key Rules
- **Lowercase Keys**: CloudFront automatically converts all header names to lowercase. You should always access and set them using lowercase keys.
- **Single Value**: Unlike Lambda@Edge (which supports multi-value headers), CloudFront Functions only support a single value per header. If you set it multiple times, only the last one wins.

In this exercise, you will practice injecting a new forensic marker into this object.

---

## 🎯 Your Goal

Implement a **CloudFront Function** that performs a forensic header injection:

1.  **Target**: Locate the `request.headers` object.
2.  **Inject**: Add a new key `x-edge-powered-by`.
3.  **Validate**: Set its value to `cloudfrontize` using the proper `{ value: "..." }` pattern.

> [!TIP]
> **Forensic Hint**: Monitor the **KB Counter** in the `CodeViewer` footer. CFF has a hard limit of 10KB. While this script is small, complex logic can quickly approach the limit in production environments.

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

### 1. The Forensic Trace (Web UI)
Because this modification happens on the server side, your browser's "Request Headers" will **not** show the change. You must use the CloudFrontize dashboard:

1.  Open the Web UI: `http://localhost:3001`
2.  Trigger a request using `curl` or your browser: `http://localhost:3000`
3.  In the **Timeline**, click on the request.
4.  Go to the **Stages** tab and find the `viewer-request-header.js` stage.
5.  Verify the **Mutated State** shows the `x-edge-powered-by` header.

### 2. Diagnostic Identity
1.  In the Dashboard diagram, click on the **Viewer Request** function node.
2.  Inspect the **Diagnostic Identity** to see the live `request.headers` object mutation.

### 3. Terminal Audit
If running with `--debug`, confirm the execution in your terminal logs:
`[CFF: viewer-request] Header Injected: x-edge-powered-by`

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
