# 5.2 The Header Injector

## 🎭 The Scenario
Your backend logs every visit, but all of them come from the same few addresses: CloudFront's. The backend team needs the **real visitor's IP address**.

## 📖 The Lesson: Request Headers for the Origin

CloudFront opens its own connection to the origin, so the origin sees CloudFront's IP address, not the viewer's. A **viewer-request** function can pass the viewer's address along in a request header. AWS uses this exact example: a `True-Client-IP` header.

- `event.viewer.ip` is the viewer's IP address (or its proxy's).
- Headers added to `request.headers` go **to the origin** with the request. The viewer never sees them; to add headers the viewer gets, use viewer-response ([5.8 The Header Policy](../5.8-header-policy/README.md)).
- Header names are **lowercase** in CloudFront Functions, and values are `{ value: '…' }` objects.
- Some names are off-limits: AWS **disallows** headers such as `X-Edge-*`, `X-Amz-Cf-*` and `Connection` (functions can't add them; CloudFrontize drops them with a warning, or answers 502 in strict mode). That's why the marker here is `x-cdn-processed`, not `x-edge-processed`.

> [!TIP]
> [CloudFront Functions event structure](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/functions-event-structure.html)

## 🗂️ This Project

| Path | What it is |
|---|---|
| `functions/cloudfront/viewer-request.header-injector.js` | The Header Injector (the solution), on **viewer-request** |
| `functions/lambda-edge/origin-response.probe.js` | A probe for this tutorial: echoes the headers the origin received, as `X-Origin-Saw-*` |
| `checks.json` | What this tutorial must do, checked automatically |

A CloudFront Function on viewer-request and Lambda@Edge on origin-response is a combination AWS allows; mixing the two kinds on the *viewer* events isn't.

## 🎯 Your Goal
Add `true-client-ip` (the viewer's IP) and `x-cdn-processed: true` to every request. To practice, replace the function with:

```javascript
async function handler(event) {
    const request = event.request;
    // TODO: request.headers['true-client-ip'] = { value: … };
    return request;
}
```

## 🛠️ Run It
From this folder:
```bash
cloudfrontize validate     # checks the project against AWS rules
cloudfrontize --webui      # serves it on http://localhost:3000, with the workbench on http://localhost:3001
cloudfrontize check        # runs checks.json
```

## 🧪 How to Test
```bash
curl -sI http://localhost:3000/index.html | grep -i x-origin-saw
```
In the workbench's **Traffic**, select the request: the **viewer-request** step marks the two headers as *added*.

## 💡 Fidelity Tips
- **CloudFront can add it for you.** The `CloudFront-Viewer-Address` header (IP and port) can be added by an origin request policy, without a function. The function is the way to go for a custom name your backend already expects.
- **Origin request policy.** In AWS, headers a function adds on viewer-request are forwarded to the origin; headers from the viewer are forwarded only if the origin request policy says so.

## 🎓 Learning More
- **AWS**: [CloudFront Functions example: add a True-Client-IP header](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/example_cloudfront_functions_add_true_client_ip_header_section.html)
