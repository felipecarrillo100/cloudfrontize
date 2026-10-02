# 2.1 The Scientist

## 🎭 The Scenario
You're running an A/B test. Visitors in the experiment group have the cookie `experiment=true`, and should see the site from the `/experimental/` folder while still browsing the same URLs (no redirect).

## 📖 The Lesson: Internal URI Rewriting

Changing `request.uri` in **origin-request** changes the object CloudFront fetches from the origin, **behind the scenes**. The browser's address bar doesn't change, unlike a `302` redirect:

| | Redirect (3xx) | Internal rewrite |
|---|---|---|
| Browser URL | Changes | Stays the same |
| Round trips | One more | None |
| How | Return a response with `Location` | Change `request.uri` |
| Best for | Moved pages, domain changes | A/B tests, localized content |

**origin-request** runs on cache misses, just before CloudFront contacts the origin, which makes it the place for decisions about *which object* to fetch.

> [!TIP]
> In the Lambda@Edge event, cookies are in `request.headers.cookie`: a list of `{ key, value }`, where a value can hold several cookies (`a=1; b=2`). See the [Lambda@Edge Event Structure Guide](../../../commons/lambda-at-edge-event.md).

## 🗂️ This Project

| Path | What it is |
|---|---|
| `functions/lambda-edge/origin-request.scientist.js` | The Scientist (the solution), on **origin-request** |
| `origins/www/` and `origins/www/experimental/` | The current and the experimental site |
| `checks.json` | What this tutorial must do, checked automatically |

## 🎯 Your Goal
For visitors with `experiment=true`, prefix the URI with `/experimental`. Match the cookie exactly: `not-experiment=true` doesn't count. To practice, replace the Scientist with:

```javascript
'use strict';

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    // TODO: if the cookie header contains experiment=true, rewrite request.uri
    return request;
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
curl -s http://localhost:3000/index.html | grep '<p>'                                # The current design.
curl -s --cookie "experiment=true" http://localhost:3000/index.html | grep '<p>'     # The experimental design...
```
In the workbench, the **Viewer** inspector's *Test request* lets you send `Cookie: experiment=true`; in **Traffic**, the **origin-request** step shows the rewritten URI.

## 💡 Fidelity Tips
- **Put the cookie in the cache key.** origin-request only runs on cache misses. If the `experiment` cookie isn't part of the cache key (cache policy), CloudFront caches whichever version the first visitor got and serves it to everyone, without calling your function again.
- **Forward the cookie.** The function only sees the cookies the cache policy or origin request policy forwards.
- **A whole template.** For a complete A/B test that also assigns visitors to a variant, see the `ab-testing` template (`cloudfrontize init --template ab-testing`).

## 🎓 Learning More
- **AWS**: [Lambda@Edge examples: A/B testing](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-examples.html)
- **AWS**: [Caching content based on cookies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Cookies.html)
