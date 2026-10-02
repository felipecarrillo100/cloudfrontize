# 5.8 The Header Policy

## 🎭 The Scenario
A security audit asks for HSTS, a Content-Security-Policy, and protection against clickjacking and MIME sniffing on every page.

## 📖 The Lesson: Response Headers, on viewer-response

Security headers instruct the **browser**, so they have to be on the **response** the browser receives. Adding them to the request on viewer-request would send them to your origin, which ignores them, and the browser would never see them.

A function on **viewer-response** runs for every response the viewer gets, whether CloudFront served it from its cache or fetched it from the origin. It changes `event.response.headers` (lowercase names, `{ value }` objects) and returns the response.

| Header | Protects against |
|---|---|
| `Strict-Transport-Security` | Downgrade to HTTP (SSL stripping) |
| `Content-Security-Policy` | Cross-site scripting, injected content |
| `X-Frame-Options` | Clickjacking (the page in someone else's frame) |
| `X-Content-Type-Options` | MIME sniffing |
| `Referrer-Policy` | Leaking URLs to other sites |

## 🗂️ This Project

| Path | What it is |
|---|---|
| `functions/cloudfront/viewer-response.header-policy.js` | The Header Policy (the solution), on **viewer-response** |
| `checks.json` | What this tutorial must do, checked automatically |

## 🎯 Your Goal
Add the five security headers to every response. To practice, replace the function with:

```javascript
async function handler(event) {
    const headers = event.response.headers;
    // TODO: headers['strict-transport-security'] = { value: '…' }; and the others
    return event.response;
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
curl -sI http://localhost:3000/index.html
```

## 💡 Fidelity Tips
- **Not on error responses.** *"CloudFront doesn't invoke edge functions for viewer response events when the origin returns HTTP status code 400 or higher."* Error pages don't get these headers (CloudFrontize does the same). A *response headers policy* covers errors too.
- **Same as 1.1, cheaper.** [1.1 The Security Guard](../../01-foundations/1.1-security-guard/README.md) does this with Lambda@Edge; a CloudFront Function costs a fraction for the same job.

## 🎓 Learning More
- **AWS**: [CloudFront Functions example: add security headers](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/example_cloudfront_functions_add_security_headers_section.html)
- **AWS**: [Response headers policies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/modifying-response-headers.html)
