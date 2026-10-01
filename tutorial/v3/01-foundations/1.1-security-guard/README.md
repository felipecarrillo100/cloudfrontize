# 1.1 The Security Guard

## 🎭 The Scenario
Your company's security audit just failed. Your backend servers are managed by another team, and they refuse to add HSTS headers. You need to enforce security at the edge.

## 📖 The Lesson: Security at the Edge

Modern web security relies on HTTP headers that tell the browser how to behave safely. One of the most important is **HSTS (HTTP Strict Transport Security)**: it forces browsers to always use HTTPS, which prevents SSL-stripping (man-in-the-middle) attacks.

### Why add headers at the edge?
You often work with legacy or "black-box" origins. Adding headers at the **CloudFront edge** lets you:
1. **Centralize policy**: apply the same security headers to every origin (S3 buckets, EC2 clusters, external APIs).
2. **Keep security out of application code**: the backend doesn't need infrastructure-level configuration.
3. **Roll out quickly**: update the policy everywhere without redeploying the backend.

### The `viewer-response` event
To change a response before it reaches the user, attach a function to the **viewer-response** event. It runs **after** CloudFront has the content (from its cache or the origin) and **before** it's sent to the client, so it's the right place to add security headers, even to cached content.

> [!TIP]
> For the event JSON and how headers are represented, see the [Lambda@Edge Event Structure Guide](../../../commons/lambda-at-edge-event.md).

## 🗂️ This Project
This folder is a complete CloudFrontize project:

| Path | What it is |
|---|---|
| `cloudfrontize.json` | The distribution: one local origin, and the Security Guard attached to **viewer-response** |
| `functions/lambda-edge/viewer-response.security-guard.js` | The Lambda@Edge function (the finished solution) |
| `origins/www/` | The website CloudFront serves |
| `checks.json` | What this tutorial must do, checked automatically |

The event a function runs on is set in `cloudfrontize.json`, under `defaultBehavior.functions`. The file name repeats it only so the folder is easy to read.

## 🎯 Your Goal
Add these headers to every response leaving CloudFront:
1. `Strict-Transport-Security`: `max-age=63072000; includeSubDomains; preload`
2. `X-Content-Type-Options`: `nosniff`

To practice, replace the body of `viewer-response.security-guard.js` with this starter code and fill in the `TODO`:

```javascript
'use strict';

exports.handler = async (event) => {
    const response = event.Records[0].cf.response;
    const headers = response.headers;

    // TODO: add the two security headers
    // headers['header-name'] = [{ key: 'Header-Name', value: 'value' }];

    return response;
};
```

## 🛠️ Run It
From this folder:
```bash
cloudfrontize validate     # checks the project against AWS rules
cloudfrontize --webui      # serves it on http://localhost:3000, with the WebUI on http://localhost:3001
```

## 🧪 How to Test

### 1. In the WebUI
1. Open `http://localhost:3001` and refresh `http://localhost:3000` in another tab.
2. In **Real-time Edge Traffic**, expand the request to see its **Execution Journey**.
3. Select the **[L@E: viewer-response]** step and check that the headers include `strict-transport-security` and `x-content-type-options`.

### 2. With `curl`
```bash
curl -I http://localhost:3000
```
You should see `strict-transport-security: max-age=63072000; includeSubDomains; preload`.

### 3. A request that fails
```bash
curl -I http://localhost:3000/missing-page.html
```
The 404 has **no** security headers. That's AWS behavior: *"CloudFront doesn't invoke edge functions for viewer response events when the origin returns HTTP status code 400 or higher."* If you need headers on error pages too, use a CloudFront response headers policy in AWS, or an **origin-response** function, which runs for every origin response.

## 💡 Fidelity Tip
In viewer-response, a Lambda@Edge function can't add, change or remove `Content-Length`, `Content-Encoding`, `Transfer-Encoding`, `Warning` or `Via`, and it can't change the status code. Run with `"strict": true` in `cloudfrontize.json` (or `--strict`) and CloudFrontize fails the request with a **502**, exactly like CloudFront.

## 🎓 Learning More
- **AWS**: [Lambda@Edge example functions: adding response headers](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-examples.html)
- **AWS**: [Restrictions on edge functions](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/edge-function-restrictions-all.html)
- **HSTS**: [MDN: Strict-Transport-Security](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security)
