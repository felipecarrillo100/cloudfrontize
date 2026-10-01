# 1.4 The Query Normalizer

## 🎭 The Scenario
Links to your site arrive full of marketing trackers:

```
/?utm_source=google&utm_campaign=spring_sale&id=123
```

The page is the same for every visitor, but each tracker combination is a different URL, so CloudFront caches the same page many times and misses the cache more often. You'll remove the trackers at the edge.

## 📖 The Lesson

### Query string pollution
Marketing parameters like `utm_source` make every link unique. If they reach the cache key, the **cache hit ratio** drops, and they're noise for your origin. Stripping them in a **viewer-request** function, before CloudFront looks up the cache, means requests that differ only in trackers share one cached copy.

### Query strings in CloudFront Functions
`request.querystring` is an object with one key per parameter:

```javascript
// ?id=123&utm_source=google
request.querystring = {
    id: { value: '123' },
    utm_source: { value: 'google' }
};
```

Delete a key and the parameter is gone. A parameter that appears more than once keeps its first value in `value`, plus a `multiValue` array with every value.

### Runtime 2.0
This function uses **CloudFront Functions JavaScript runtime 2.0**, selected with `"runtime": "cloudfront-js-2.0"` in `cloudfrontize.json`. Compared with runtime 1.0 (ES 5.1 only), it adds `const` and `let`, arrow functions, template literals, `async`/`await` and more. It is also the runtime that can read a KeyValueStore (see [1.12 The Redirect Map](../1.12-redirect-map/README.md)). CloudFrontize checks your code against the runtime you choose, as AWS would.

## 🗂️ This Project

| Path | What it is |
|---|---|
| `functions/cloudfront/viewer-request.query-normalizer.js` | The CloudFront Function (runtime 2.0), on **viewer-request** |
| `functions/lambda-edge/origin-response.query-probe.js` | A probe for this tutorial: adds `X-Origin-Query` with the query string the origin received |
| `cloudfrontize.json` | Both functions on the default behavior |
| `checks.json` | What this tutorial must do, checked automatically |

A CloudFront Function on a viewer event together with Lambda@Edge on an origin event is a combination AWS allows. What AWS doesn't allow is mixing the two kinds on the viewer events (viewer-request and viewer-response) of the same behavior; `cloudfrontize validate` reports it if you try.

## 🎯 Your Goal
Remove `utm_source`, `utm_medium`, `utm_campaign`, `utm_term` and `utm_content`, and keep every other parameter. To practice, replace the normalizer with:

```javascript
function handler(event) {
    const request = event.request;
    // TODO: delete the tracking parameters from request.querystring
    return request;
}
```

## 🛠️ Run It
From this folder:
```bash
cloudfrontize validate
cloudfrontize --webui
```

## 🧪 How to Test
```bash
curl -sI "http://localhost:3000/?utm_source=google&id=123&utm_campaign=spring_sale" | grep -i x-origin-query
# X-Origin-Query: id=123
```
In the workbench's **Traffic**, select the request: its **viewer-request** step shows the query string after the function.

## 💡 Fidelity Tips
- **Viewer-response can't change the query string.** AWS: *"A function can read a query string, but cannot create or update one, for origin response and viewer response events."* Normalizing belongs in viewer-request.
- **The cache key.** In AWS, which parameters are part of the cache key is set by the **cache policy**. Removing them in viewer-request works whatever the policy says.
- **Runtime 2.0 is not "all of modern JavaScript".** Features AWS doesn't list, such as `for...of`, destructuring or classes, may fail when deployed; CloudFrontize warns about them.

## 🎓 Learning More
- **AWS**: [JavaScript runtime 2.0 features](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/functions-javascript-runtime-20.html)
- **AWS**: [CloudFront Functions event structure: query strings](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/functions-event-structure.html)
- **AWS**: [Cache key settings](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/controlling-the-cache-key.html)
