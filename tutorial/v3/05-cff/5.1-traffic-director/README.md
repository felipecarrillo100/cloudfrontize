# 5.1 The Traffic Director

## 🎭 The Scenario
Marketing printed `/promo` on thousands of flyers, then moved the campaign to `/summer-sale`. Visitors with the old URL must land on the new page, quickly, without a round trip to your origin.

## 📖 The Lesson: Redirects with CloudFront Functions

**CloudFront Functions** are small JavaScript functions that run on **viewer** events at every CloudFront edge location, in under a millisecond, for a fraction of Lambda@Edge's price. They're made for exactly this kind of job: redirects, rewrites, header changes.

A function on **viewer-request** can answer the viewer itself: return a **response** instead of the request, and CloudFront sends it back at once. For a redirect, that's a `statusCode` of **301** (moved permanently: browsers and search engines update their links) or **302** (temporary), and a `location` header.

The CloudFront Functions event differs from Lambda@Edge's:

| | CloudFront Functions | Lambda@Edge |
|---|---|---|
| Header | `headers.location = { value: '/x' }` | `headers.location = [{ key: 'Location', value: '/x' }]` |
| Status | `statusCode: 301` (a number) | `status: '301'` (a string) |
| Query string | an object: `querystring.ref.value` | a string: `'ref=newsletter'` |

> [!TIP]
> [CloudFront Functions event structure](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/functions-event-structure.html)

## 🗂️ This Project

| Path | What it is |
|---|---|
| `functions/cloudfront/viewer-request.traffic-director.js` | The Traffic Director (the solution), runtime 2.0, on **viewer-request** |
| `cloudfrontize.json` | The function on the default behavior |
| `checks.json` | What this tutorial must do, checked automatically |

## 🎯 Your Goal
Redirect `/promo` to `/summer-sale` with a 301, keeping the query string. To practice, replace the function with:

```javascript
async function handler(event) {
    const request = event.request;
    // TODO: for /promo, return { statusCode: 301, statusDescription, headers: { location: { value } } }
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
curl -I "http://localhost:3000/promo?ref=newsletter"     # 301, Location: /summer-sale?ref=newsletter
```

## 💡 Fidelity Tips
- **Runtime 2.0** allows `const`, arrow functions and template literals; **runtime 1.0** is ES 5.1 only. CloudFrontize checks the code against the runtime in `cloudfrontize.json`, as AWS does.
- **Many redirects?** Keep them in a key value store instead of the code: see [5.12 The Redirect Map](../5.12-redirect-map/README.md).

## 🎓 Learning More
- **AWS**: [CloudFront Functions example: redirect to a new URL](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/example_cloudfront_functions_redirect_based_on_country_section.html)
