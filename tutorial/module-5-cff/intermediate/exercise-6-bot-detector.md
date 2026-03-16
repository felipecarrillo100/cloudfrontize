# Exercise 3.1: The Bot Detector

## 🎭 The Scenario

Your site has been experiencing unusual traffic spikes caused by **automated bots** hitting endpoints.

To protect resources and improve security, you decide to **detect and block suspicious User-Agent strings** directly at the edge using a **CloudFront Function**.

This allows you to **stop unwanted bots before they reach your origin**, saving bandwidth and backend processing.

---

## 🎯 Your Goal

Implement a **CloudFront Function** that:

* inspects the `User-Agent` header
* detects requests from known or suspicious bots (e.g., containing `"curl"`, `"bot"`, `"spider"`, `"crawler"`)
* returns a **403 Forbidden** response for these requests
* lets all other requests continue normally

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

### 1. Using a Browser

1. Open any URL:

```
http://localhost:3000
```

2. You can overwrite this header with `--headers`  because the browser will overwrite the `User-Agent` header every time with the browser id.

3. Run it to CloudFrontize:

```bash
cloudfrontize www --cff ./tutorial-cff/intermediate/viewer-request-bot-detector.js --debug --mode website
```

4. Visit the root URL: http://localhost:3000/
* Normal browser request wil show User-Agent strings (e.g., `"Mozilla/5.0"`).

---

### 2. Using `curl`

```bash
curl -i -H "User-Agent: GPTBot" http://localhost:3000/
```

* Since lower case User-Agent: `gptbot` contains `bot` in it, the response should be **403 Forbidden**.
* Changing the User-Agent to `"Mozilla/5.0"` should return the normal page content.

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
