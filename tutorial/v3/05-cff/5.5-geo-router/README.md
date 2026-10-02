# 5.5 The Geo Router

## 🎭 The Scenario
Each country gets its own version of the site (`/countries/FR/`, `/countries/MX/`, `/countries/US/`), but everyone should use the same URLs.

## 📖 The Lesson: Location at the Edge, with CloudFront Functions

CloudFront adds **location headers** (`CloudFront-Viewer-Country`, `-City`, `-Time-Zone`…) to requests, when a cache or origin request policy asks for them. When they become visible depends on the kind of function:

| | CloudFront Functions | Lambda@Edge |
|---|---|---|
| viewer-request | ✅ sees them | ❌ CloudFront adds them after this event |
| origin-request | — | ✅ |

So a CloudFront Function can route by country **before the cache**, on every request, which is what this one does with an internal rewrite. Compare with [2.2 The Diplomat](../../02-origin/2.2-diplomat/README.md), which does it with Lambda@Edge on origin-request.

A value CloudFront adds overrides one the viewer sends, so routing can't be faked with a header.

## 🗂️ This Project

| Path | What it is |
|---|---|
| `functions/cloudfront/viewer-request.geo-router.js` | The Geo Router (the solution), on **viewer-request** |
| `config/headers.json` | The viewer simulation: CloudFront says the visitor is in France |
| `origins/www/countries/` | One site per country |
| `checks.json` | What this tutorial must do, checked automatically |

## 🎯 Your Goal
Rewrite the URI to `/countries/<code>/…` (FR, MX or US; US for any other country), without rewriting URIs that are already under `/countries/`. To practice, replace the function with:

```javascript
async function handler(event) {
    const request = event.request;
    // TODO: read request.headers['cloudfront-viewer-country'] and rewrite request.uri
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
curl -s http://localhost:3000/ | grep '<h1>'           # France
```
To be somewhere else, pick a country in the workbench's **Viewer** inspector (**Location** presets) and save, or edit `config/headers.json`.

## 💡 Fidelity Tips
- **Cache key.** If the content depends on the country, add `CloudFront-Viewer-Country` to the cache key (cache policy), or the first visitor's version is cached for everyone.
- **Not every visitor has a country.** Some addresses can't be located: always have a default.

## 🎓 Learning More
- **AWS**: [Add CloudFront request headers: viewer location](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/adding-cloudfront-headers.html#cloudfront-headers-viewer-location)
- **AWS**: [CloudFront Functions example: redirect based on country](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/example_cloudfront_functions_redirect_based_on_country_section.html)
