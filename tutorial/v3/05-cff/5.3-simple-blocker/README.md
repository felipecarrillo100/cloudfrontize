# 5.3 The Simple Blocker

## 🎭 The Scenario
The origin has an `/admin` console that must only be reachable from the office network, never through the public distribution. Scanners also keep asking for `/.env` and `/.git`.

## 📖 The Lesson: Blocking at the Edge

A **viewer-request** function that returns a `403` stops the request at the edge location: the cache and the origin never see it. Two details make the difference between a blocker and a leaky one:

- **Match whole path segments.** `uri.startsWith('/admin')` would also block `/administrators-guide.html`. Match `/admin` exactly, or anything under `/admin/`.
- **Normalize case** when the origin is case-insensitive (many are): `/ADMIN` must be blocked too.

> [!TIP]
> [CloudFront Functions event structure](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/functions-event-structure.html)

## 🗂️ This Project

| Path | What it is |
|---|---|
| `functions/cloudfront/viewer-request.simple-blocker.js` | The Simple Blocker (the solution), on **viewer-request** |
| `origins/www/` | A public page, an `/admin` console, and a page whose name starts with "admin" |
| `checks.json` | What this tutorial must do, checked automatically |

## 🎯 Your Goal
Return `403` for `/admin`, `/admin/…`, `/.env` and `/.git`, in any letter case, without blocking `/administrators-guide.html`. To practice, replace the function with:

```javascript
async function handler(event) {
    // TODO: return a 403 response for the blocked paths
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
curl -I http://localhost:3000/admin/index.html              # 403
curl -I http://localhost:3000/administrators-guide.html     # 200
```

## 💡 Fidelity Tips
- **A cache behavior is often cleaner.** A `/admin/*` behavior with its own blocking function keeps the default behavior free of the check (see [3.1 The Bouncer](../../03-edge/3.1-bouncer/README.md)).
- **For real protection, add AWS WAF**, or don't route `/admin` through the public distribution at all. A function is a good last line, not the only one.

## 🎓 Learning More
- **AWS**: [Restricting access to content](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/PrivateContent.html)
