# 1.2 The Librarian

## 🎭 The Scenario
Your cache hit ratio is terrible. `?id=123&ref=google` and `?ref=google&id=123` return the same page, but CloudFront caches them as two different objects, so the origin gets hit twice.

## 📖 The Lesson: Query String Normalization

When the query string is part of the **cache key**, its exact text matters: different parameter orders are different cache entries. That's **cache fragmentation**, and it sends requests to your origin that the cache could have answered.

A function on **viewer-request** runs before CloudFront looks in its cache. If it puts the parameters in a fixed order, every variation of the same request maps to one cache entry.

`URLSearchParams` does the work: it parses the query string, and `sort()` orders the parameters by name.

> [!TIP]
> For the Lambda@Edge event JSON, see the [Lambda@Edge Event Structure Guide](../../../commons/lambda-at-edge-event.md).

## 🗂️ This Project

| Path | What it is |
|---|---|
| `functions/lambda-edge/viewer-request.librarian.js` | The Librarian (the solution), on **viewer-request** |
| `functions/lambda-edge/viewer-response.query-echo.js` | A probe for this tutorial: reports the final query string in `X-Query` |
| `cloudfrontize.json` | Both functions on the default behavior |
| `checks.json` | What this tutorial must do, checked automatically |

## 🎯 Your Goal
Sort the query string's parameters by name. To practice, replace the Librarian with:

```javascript
'use strict';

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    if (!request.querystring) return request;
    // TODO: sort the parameters (URLSearchParams has a sort() method)
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
curl -sI "http://localhost:3000/index.html?z=9&a=1" | grep -i x-query
# X-Query: a=1&z=9
```
In the workbench's **Traffic**, select the request: the **viewer-request** step shows the query string changing.

## 💡 Fidelity Tips
- **This is a job for CloudFront Functions.** AWS lists *cache key normalization* among what CloudFront Functions are for: they're cheaper and faster than Lambda@Edge for small changes like this one. See [1.4 The Query Normalizer](../../05-cff/1.4-query-normalizer/README.md) for a CloudFront Function version.
- **Only what's in the cache key matters.** A cache policy decides which query parameters are part of the cache key; normalizing helps when they are.

## 🎓 Learning More
- **AWS**: [Caching content based on query string parameters](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/QueryStringParameters.html)
- **AWS**: [Lambda@Edge example functions: query strings](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-examples.html)
