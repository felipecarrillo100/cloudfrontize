# 2.3 The Cloaker

## 🎭 The Scenario
A security scan flagged your site: responses say `Server: Apache/2.4.41 (Ubuntu)` and `X-Powered-By: PHP/5.6.40`. Exact versions are a roadmap for attackers looking for known vulnerabilities, and the backend team can't change the server configuration this quarter.

## 📖 The Lesson: Cleaning Responses at the Edge

**origin-response** runs when the origin answers (on cache misses), **before** CloudFront stores the response in its cache. Removing headers there means:

1. **The cache stays clean**: what's cached, and served to everyone afterwards, never had the headers.
2. **It runs once per object**, not on every viewer request (viewer-response would run on every request, cached or not).

In the Lambda@Edge event, header names in `response.headers` are lowercase, whatever case the origin used, so `delete headers['server']` works for `Server` and `SERVER`.

> [!TIP]
> See the [Lambda@Edge Event Structure Guide](../../../commons/lambda-at-edge-event.md).

## 🗂️ This Project

| Path | What it is |
|---|---|
| `functions/lambda-edge/origin-response.cloaker.js` | The Cloaker (the solution), on **origin-response** |
| `config/origin-headers.json` | The viewer simulation's `responseHeaders`: makes the local origin answer like that leaky server |
| `checks.json` | What this tutorial must do, checked automatically |

A folder origin doesn't send `Server` or `X-Powered-By`, so the project simulates them: `responseHeaders` in the viewer simulation file are added to every origin response, before origin-response functions run.

## 🎯 Your Goal
Remove `Server` and `X-Powered-By` (and other version-revealing headers), keeping everything else. To practice, replace the Cloaker with:

```javascript
'use strict';

exports.handler = async (event) => {
    const response = event.Records[0].cf.response;
    // TODO: delete the revealing headers from response.headers
    return response;
};
```

## 🛠️ Run It
From this folder:
```bash
cloudfrontize validate     # checks the project against AWS rules
cloudfrontize --webui      # serves it on http://localhost:3000, with the workbench on http://localhost:3001
cloudfrontize check        # runs checks.json: does it do what this article says?
```

## 🧪 How to Test
```bash
curl -sI http://localhost:3000/index.html
```
No `Server` or `X-Powered-By`; `X-Request-Time` is still there. In the workbench's **Traffic**, select the request: the **Origin response** step shows the headers the origin sent, and the **origin-response** step shows them removed.

## 💡 Fidelity Tips
- **Why not viewer-response?** It would run on every response, including cached ones, and the cache would still hold the revealing headers.
- **CloudFront's own `Server` header.** In AWS, CloudFront adds `Server: CloudFront` (or `AmazonS3` from S3 origins) to responses itself. Removing it needs a *response headers policy*; functions can't remove what CloudFront adds after them.

## 🎓 Learning More
- **AWS**: [Lambda@Edge examples: updating response headers](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-examples.html)
- **AWS**: [Response headers policies: removing headers](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/modifying-response-headers.html)
