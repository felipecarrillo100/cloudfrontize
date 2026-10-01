# 5.10 The Cookie Gate

## 🎭 The Scenario
Your news site lets readers see **5 free articles**; after that, they're invited to subscribe. The count should live in the reader's browser, with no backend changes.

## 📖 The Lesson: Two Functions, One Behavior

This needs both viewer events, which is why it's a pair of functions on the `/articles/*` cache behavior:

1. **viewer-request** (`article-meter`) reads the `articles-read` cookie. At 5 or more, it answers with a `302` to `/subscribe.html`: the article is never fetched.
2. **viewer-response** (`article-counter`) adds one to the count and sets the cookie on the response (`event.response.cookies`), so the next request carries the new value.

Both are **CloudFront Functions**: AWS doesn't allow a CloudFront Function and a Lambda@Edge function on the viewer events of the same behavior, so the pair must be the same kind. Only `/articles/*` runs them; the rest of the site isn't metered.

> [!NOTE]
> The counter reads the cookie from the viewer's request, not anything the meter changed, so it doesn't depend on whether viewer-response functions see viewer-request changes.

## 🗂️ This Project

| Path | What it is |
|---|---|
| `functions/cloudfront/viewer-request.article-meter.js` | The meter (viewer-request) |
| `functions/cloudfront/viewer-response.article-counter.js` | The counter (viewer-response) |
| `cloudfrontize.json` | Both on the `/articles/*` behavior |
| `checks.json` | What this tutorial must do, checked automatically |

## 🎯 Your Goal
Redirect readers with 5 or more articles read, and count every article served. To practice, replace both functions with:

```javascript
async function handler(event) {
    // meter (viewer-request): read event.request.cookies['articles-read']; 5 or more: 302 to /subscribe.html
    return event.request;
}
```
```javascript
async function handler(event) {
    // counter (viewer-response): event.response.cookies['articles-read'] = { value: …, attributes: 'Path=/; …' }
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
Open [http://localhost:3000/articles/edge-computing.html](http://localhost:3000/articles/edge-computing.html) in a browser and reload it: the sixth time, you're asked to subscribe. In the workbench's **Traffic**, each response's headers show the new `Set-Cookie`.

## 💡 Fidelity Tips
- **A soft limit.** The count is in the reader's cookie: clearing cookies or a private window resets it. That's normal for metered paywalls (it keeps casual readers honest); for hard limits, use sign-in.
- **Don't cache the redirect, do vary the article.** The `302` is `no-store`. Articles themselves can be cached normally: the counter runs on every response, cached or not.

## 🎓 Learning More
- **AWS**: [CloudFront Functions event structure: cookies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/functions-event-structure.html)
