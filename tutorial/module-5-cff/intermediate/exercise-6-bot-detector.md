# Exercise 3.1: The Bot Detector

## 🎭 The Scenario

Your site has been experiencing unusual traffic spikes caused by **automated bots** hitting endpoints.

To protect resources and improve security, you decide to **detect and block suspicious User-Agent strings** directly at the edge using a **CloudFront Function**.

This allows you to **stop unwanted bots before they reach your origin**, saving bandwidth and backend processing.

---

## 📖 The Lesson: User-Agent Forensics

The `User-Agent` header is a window into the identity of the client making the request. While it can be easily spoofed, it remains a primary signal for identifying well-behaved bots, crawlers, and scrapers.

### High-Performance Inspection
In CFF, you have ~1ms of CPU time to decide the fate of a request. This is why we use simple string searches or lightweight Regular Expressions instead of complex device databases.
- **Lowercasing**: Always convert the `User-Agent` string to lowercase before searching for patterns like `bot`, `crawler`, or `spider`.
- **String Searching**: Use `indexOf` (ES5) to check for these patterns.

By blocking bots at the edge, you avoid "Polluting" your backend analytics and save CPU cycles on your origin servers.

---

## 🎯 Your Goal

Implement a **CloudFront Function** that performs forensic bot detection:

1.  **Extract**: Read the `user-agent` header from the `request.headers` object.
2.  **Analyze**: Convert the string to lowercase and check for forbidden keywords (`bot`, `spider`, `crawler`).
3.  **Verdict**: Return a **403 Forbidden** response immediately if a bot is detected.

> [!TIP]
> **Forensic Hint**: CloudFrontize will highlight any **Line Errors** if you use unsupported ES6 string methods like `.includes()`. Use the **CodeViewer** to ensure your code is strictly ES5.1 before running your `curl` tests.

---

## 📝 Starter Code Template

```javascript
function handler(event) {

    var request = event.request;
    var headers = request.headers;

    // TODO:
    // Inspect the "User-Agent" header
    // If it contains suspicious bot patterns
    // return a 403 Forbidden response
    // Otherwise, return the original request

    return request;

}
```

---

## 🛠 Instructions

1. Create the exercise file:

```bash
tutorial/module-5-cff/advanced/viewer-request-bot-detector.js
```

2. Implement the bot detection logic inside the `handler()` function.

3. Start the CloudFrontize emulator:

```bash
cloudfrontize www --cff ./tutorial/module-5-cff/advanced/viewer-request-bot-detector.js
```

---

## 🧪 How to Test

### 1. The Forensic Trace (Web UI)
Bot detection is a security "Short-Circuit." Use the dashboard to confirm the bot was neutralized at the edge:

1.  Open the Web UI: `http://localhost:3001`
2.  Trigger a bot request using `curl`:
    `curl -i -H "User-Agent: BadSpider/1.0" http://localhost:3000/`
3.  In the **Timeline**, click the request.
4.  Observe the **Stage Trace**: The request should stop at the **Viewer Request** stage with a `403` status.
5.  **Logs**: Check the logs tab in the UI to see the `Bot Blocked: BadSpider/1.0` message.

### 2. Diagnostic Identity
1.  In the Dashboard diagram, click on the **Viewer Request** function node.
2.  Inspect the **Diagnostic Identity** to verify the `User-Agent` header was correctly parsed by your code.

### 3. Verification with `curl`
`curl -v -H "User-Agent: Chrome" http://localhost:3000/` -> **200 OK**
`curl -v -H "User-Agent: GoogleBot" http://localhost:3000/` -> **403 Forbidden**

---

## 💡 Fidelity Tip

CloudFront Functions allow **fast, lightweight request inspection at the edge**, making them perfect for:

* Bot mitigation
* Access control
* Simple rate-limiting or filtering
* Lightweight security enforcement

Because this check happens **before the request reaches your origin**, it improves both **performance** and **security**.

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
CloudFront Function bot detection
viewer-request User-Agent filter
Edge security
403 Forbidden at edge
```

---
[⬅️ Back to Syllabus](../README.md)
