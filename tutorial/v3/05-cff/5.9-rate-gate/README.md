# 5.9 The Rate Gate

## 🎭 The Scenario
Your API's official SDK counts its own calls and sends the count in `x-request-count`. When a client goes over 100 calls a minute, the edge should tell it to slow down, so a buggy loop in a customer's app doesn't hit your backend.

## 📖 The Lesson: Responding with 429

`429 Too Many Requests` tells a client it's over a limit; a `Retry-After` header (seconds) says when to try again. Well-behaved clients and SDKs honor it. A **viewer-request** function can answer it before the request reaches the cache or the origin.

### What a CloudFront Function can't do: count
CloudFront Functions are **stateless**: each request runs alone, with nothing shared between requests or edge locations, and no network to call a database. So a function can't count requests itself; it can only act on what the request carries. Here that's a header the client sends, which means **the client could lie**. That's fine for its purpose (protecting customers from their own bugs), not for stopping abuse.

For real rate limiting, use **AWS WAF rate-based rules**: they count requests per IP (or per header, cookie…) across CloudFront and block or challenge clients over the limit.

## 🗂️ This Project

| Path | What it is |
|---|---|
| `functions/cloudfront/viewer-request.rate-gate.js` | The Rate Gate (the solution), on **viewer-request** |
| `checks.json` | What this tutorial must do, checked automatically |

## 🎯 Your Goal
Return `429` with `Retry-After: 60` when `x-request-count` is over 100. To practice, replace the function with:

```javascript
async function handler(event) {
    const header = event.request.headers['x-request-count'];
    // TODO: over the limit: return { statusCode: 429, statusDescription, headers: { 'retry-after': … } }
    return event.request;
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
curl -i -H "x-request-count: 101" http://localhost:3000/index.html     # 429
```

## 💡 Fidelity Tips
- **State at the edge.** For data a function can read (but not write) at the edge, CloudFront Functions have **KeyValueStore** ([5.12](../5.12-redirect-map/README.md)). Counting needs AWS WAF.
- **Cookies are client state too.** [5.10 The Cookie Gate](../5.10-cookie-gate/README.md) keeps a counter in a cookie: same trust caveat, different use.

## 🎓 Learning More
- **AWS**: [AWS WAF rate-based rules](https://docs.aws.amazon.com/waf/latest/developerguide/waf-rule-statement-type-rate-based.html)
