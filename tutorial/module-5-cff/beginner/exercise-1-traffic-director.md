# Exercise 1.1: The Traffic Director

## 🎭 The Scenario

Your marketing team has launched a new campaign and renamed a popular landing page.

The old campaign URL:

```
/promo
```

must now redirect visitors to the new page:

```
/summer-sale
```

Rather than modifying your origin server or deploying new backend code, you decide to handle this redirect **directly at the edge using a CloudFront Function**.

This ensures the redirect happens **instantly at the nearest CloudFront edge location**, reducing latency and unnecessary origin traffic.

---

## 📖 The Lesson: The CFF Request Pipeline

CloudFront Functions (CFF) are designed for ultra-low-latency operations. They run at the **edge locations** (Points of Presence) before the request even checks the CloudFront cache or hits your origin server.

### Why use CFF for Redirects?
Redirecting at the edge is significantly more efficient than doing it at your origin:
- **Zero Origin Load**: Your servers never see the request.
- **Minimum Latency**: The user gets a response from the nearest edge location (often < 10ms away).
- **Cost Effective**: CFF is 1/6th the price of Lambda@Edge.

In this exercise, you'll use the `request.uri` property to detect the old path and return a custom response object to trigger a **301 Moved Permanently** redirect.

---

## 🎯 Your Goal

Implement a **CloudFront Function** that performs a forensic redirect:

1.  **Identify**: Detect incoming requests where the URI is exactly `/promo`.
2.  **Short-Circuit**: Instead of passing the request forward, return a **301 Status Response**.
3.  **Route**: Set the `Location` header to `/summer-sale`.

> [!IMPORTANT]
> ### 🛑 The CFF Contract: Avoid the "Silent Failure"
> CloudFront Functions use a strictly different response object than Lambda@Edge. If you use L@E syntax here, the function will fail.
> 1. **Status Code**: Use `statusCode: 301` (number), NOT `status: '301'` (string).
> 2. **Headers**: Use the object format: `headers: { location: { value: '/new-path' } }`.
> 3. **Syntax**: CFF only supports **ECMAScript 5.1**. You must use `var`, not `const` or `let`.

---

## 📝 Starter Code Template

```javascript
function handler(event) {

    var request = event.request;
    var uri = request.uri;

    // TODO:
    // If the request URI is "/promo",
    // return a 301 redirect to "/summer-sale"

    return request;

}
```

---

## 🛠 Instructions

1. Create the exercise file:

```
tutorial/module-5-cff/beginner/viewer-request-redirect.js
```

2. Implement the redirect logic inside the `handler()` function.

3. Start the CloudFrontize emulator:

```bash
cloudfrontize www --cff ./tutorial/module-5-cff/beginner/viewer-request-redirect.js --debug --mode website
```
>**HINT**: The flag `--mode website` takes care of appending index.html simplifying the task

---

---

## 🧪 How to Test

### 1. The Execution Journey (Visual Control Plane)
While you can see a redirect in your browser, the **WebUI** provides a deeper look at the "Short-Circuit" execution:

1.  Open the **WebUI**: `http://localhost:3001`
2.  In your browser, visit: `http://localhost:3000/promo`
3.  In the **Real-time Edge Traffic** list, click the request row to expand the **Execution Journey**.
4.  In the journey tree, click the **[CFF: viewer-request]** station.
5.  In the **State Inspector** panel, verify the `301` response object your code generated.
6.  **Origin Fetch**: Notice that the Origin Fetch stage is **skipped**. This confirms the edge handled the response without ever hitting your origin.

### 3. Using your browser
Open `http://localhost:3000/promo`. You should be automatically redirected to `/summer-sale`.

### 4. Using `curl`
`curl -v -I http://localhost:3000/promo`
Check for `HTTP/1.1 301 Moved Permanently` and `location: /summer-sale`.

---

## 💡 Fidelity Tip

CloudFront Functions execute **before Lambda@Edge** and even **before the request reaches your origin server**.

This makes them perfect for **lightweight, high-performance tasks** such as:

* URL redirects
* header normalization
* bot blocking
* request rewrites

Because the response is generated **at the edge**, the request never reaches your backend infrastructure.

CloudFront Functions also have strict runtime constraints:

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
`CloudFront Function redirect`, `viewer-request redirect`, `Edge redirect CloudFront`

---

> [!CAUTION]
> ### 🛑 Forensic Troubleshooting: Port 3000 Hangups
> If the emulator fails to start because "Port 3000 is already in use," it means a previous session didn't close properly. 
> 1. Run: `netstat -ano | findstr :3000` to find the PID.
> 2. Run: `taskkill /F /PID <PID_NUMBER>` to clear the ghost process.

---
[⬅️ Back to Syllabus](../README.md)
