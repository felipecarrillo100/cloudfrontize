# 3.2 The Architect

## 🎭 The Scenario
You're migrating the database tonight. Every visitor should see a friendly maintenance page, without stopping servers or changing DNS, and without a single request reaching the origin.

## 📖 The Lesson: Generating Responses at the Edge

A Lambda@Edge function on **viewer-request** can return a **response** instead of the request. CloudFront sends it straight to the viewer: the cache and the origin are skipped. That's the edge's safety switch:

- **Maintenance windows**: a branded page while the backend is down.
- **Gatekeeping**: blocking or redirecting before anything reaches your servers (see [3.1 The Bouncer](../3.1-bouncer/README.md)).
- **Simple answers**: `robots.txt`, health checks, small JSON documents.

A generated response has a `status`, optional `statusDescription` and `headers`, and a `body` (text, or base64 with `bodyEncoding: 'base64'`).

Use **503 Service Unavailable** for maintenance, with `Retry-After`: browsers and search engines understand it's temporary, so your pages don't drop out of search results. `Cache-Control: no-store` keeps the maintenance page out of caches, so the site comes back the moment you remove the function.

> [!TIP]
> See the [Lambda@Edge Event Structure Guide](../../../commons/lambda-at-edge-event.md).

## 🗂️ This Project

| Path | What it is |
|---|---|
| `functions/lambda-edge/viewer-request.architect.js` | The Architect (the solution), on **viewer-request** |
| `origins/www/` | The real site, which nobody sees during maintenance |
| `checks.json` | What this tutorial must do, checked automatically |

## 🎯 Your Goal
Answer every request with a 503 maintenance page (HTML, `Retry-After`, not cached). To practice, replace the Architect with:

```javascript
'use strict';

exports.handler = async (event) => {
    // TODO: return { status, statusDescription, headers, body }
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
curl -i http://localhost:3000/
```
In the workbench, **Disable for testing** the Architect (right-click it on the schematic) to see the real site again, then enable it: that's maintenance mode on and off. In **Traffic**, the journey ends with *Generated response*: the origin never sees the request.

## 💡 Fidelity Tips
- **Size limit.** A response generated on **viewer-request** (or viewer-response) is limited to **40 KB** including headers; on origin events, 1 MB. CloudFrontize enforces it (strict mode: 502). Inline CSS, and keep images on a CDN path that isn't in maintenance.
- **A CloudFront Function can do this too**, and costs less on a high-traffic site: return `{ statusCode: 503, statusDescription, headers, body }` from a viewer-request CloudFront Function.

## 🎓 Learning More
- **AWS**: [Generating HTTP responses in request triggers](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-generating-http-responses.html)
- **AWS**: [Quotas on Lambda@Edge: response size](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-limits.html#limits-lambda-at-edge)
