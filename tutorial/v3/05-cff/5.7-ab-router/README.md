# 5.7 The A/B Router

## 🎭 The Scenario
Design has a new landing page. Half the visitors should see it, the other half the original, and each visitor must keep seeing the same one, so the numbers mean something.

## 📖 The Lesson: Cookies in CloudFront Functions

In CloudFront Functions, cookies have their own object, separate from the headers:

- **Reading:** `event.request.cookies.ab_test_group.value` (there's no `cookie` header in `request.headers`).
- **Setting:** only a **response** can set cookies: `cookies: { name: { value, attributes: 'Path=/; Max-Age=…' } }` becomes a `Set-Cookie` header.

A viewer-request function returns either the request (it can't set cookies then) or a response. So a visitor's first request gets a `302` back to the same URL that sets the group cookie, and every request after that is routed with an **internal rewrite** to the group's page.

Picking the group randomly *without* storing it would show each visitor a different page on every visit: the test would be meaningless.

## 🗂️ This Project

| Path | What it is |
|---|---|
| `functions/cloudfront/viewer-request.ab-router.js` | The A/B Router (the solution), on **viewer-request** |
| `origins/www/landing/` | The two versions of the page |
| `checks.json` | What this tutorial must do, checked automatically |

## 🎯 Your Goal
Assign visitors to group A or B with an `ab_test_group` cookie (via a redirect), and serve the group's page at `/`. To practice, replace the function with:

```javascript
async function handler(event) {
    const request = event.request;
    // TODO: no valid cookie: 302 to request.uri with cookies: { ab_test_group: { value, attributes } }
    // TODO: with a cookie: rewrite request.uri to the group's page
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
curl -i http://localhost:3000/                                   # 302 with Set-Cookie
curl -s --cookie "ab_test_group=B" http://localhost:3000/        # the new design
```
Open the site in two different browsers: each one keeps its group.

## 💡 Fidelity Tips
- **Put the cookie in the cache key** (cache policy), or CloudFront caches one version of `/` and serves it to both groups.
- **A complete version** is the `ab-testing` template: `cloudfrontize init my-test --template ab-testing`.

## 🎓 Learning More
- **AWS**: [CloudFront Functions event structure: cookies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/functions-event-structure.html)
