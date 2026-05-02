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

> [!IMPORTANT]
> ### 🛑 The CFF Contract: ES5.1 String Analysis
> CloudFront Functions execute in a specialized V8 sandbox that only supports **ECMAScript 5.1**. 
> 1. **No `.includes()`**: This ES6 method is not available. You must use `indexOf(search) !== -1` for string/array checks.
> 2. **Lowercasing**: Always use `.toLowerCase()` before checking for bot signatures to ensure case-insensitive detection.
> 3. **The Response Contract**: Remember to include `statusCode`, `statusDescription`, and `headers` in your 403 response.

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

### 1. The Execution Journey (Visual Control Plane)
Bot detection is a security "Short-Circuit." Use the **WebUI** to confirm the bot was neutralized at the edge:

1.  Open the **WebUI**: `http://localhost:3001`
2.  Trigger a bot request using `curl`:
    `curl -i -H "User-Agent: BadSpider/1.0" http://localhost:3000/`
3.  In the **Real-time Edge Traffic** list, click the request row to expand the **Execution Journey**.
4.  In the journey tree, click the **[CFF: viewer-request]** station.
5.  In the **State Inspector** panel, verify that the execution journey ends here (Short-Circuit) and that the status is `403`.

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
`CloudFront Function bot detection`, `viewer-request User-Agent filter`, `Edge security`, `403 Forbidden at edge`

---

> [!CAUTION]
> ### 🛑 Forensic Troubleshooting: Port 3000 Hangups
> If the emulator fails to start because "Port 3000 is already in use," it means a previous session didn't close properly. 
> 1. Run: `netstat -ano | findstr :3000` to find the PID.
> 2. Run: `taskkill /F /PID <PID_NUMBER>` to clear the ghost process.

---
[⬅️ Back to Syllabus](../README.md)
