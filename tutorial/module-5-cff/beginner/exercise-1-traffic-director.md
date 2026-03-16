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

## 🎯 Your Goal

Implement a **CloudFront Function** that:

* detects requests to `/promo`
* returns a **301 redirect**
* sends the user to `/summer-sale`

All other requests should continue normally.

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

## 🧪 How to Test

### 1. Using your browser

Open:

```
http://localhost:3000/promo
```

* You should be automatically redirected to:

```
http://localhost:3000/summer-sale
```

* If you visit any other URL (e.g., `/about`), it should **load normally** without redirection.

### 2. Using `curl` (for terminal verification)

```bash
curl -v -I http://localhost:3000/promo
```

* You should see headers similar to:

```
HTTP/1.1 301 Moved Permanently
location: /summer-sale
```

* Any other path should return `200 OK` without a `Location` header.

### 3. Inspect headers

* In your browser, open **Developer Tools → Network tab**
* Click the `/promo` request
* Confirm the **response status is 301** and the **Location header points to `/summer-sale`**

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

```
CloudFront Function redirect
viewer-request redirect
Edge redirect CloudFront
```

---
[⬅️ Back to Syllabus](../README.md)
