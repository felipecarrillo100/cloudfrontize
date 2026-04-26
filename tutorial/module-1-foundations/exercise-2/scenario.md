# Exercise 1.2: The Librarian

## 🎭 The Scenario
Your CloudFront cache hit ratio is terrible. You realized that `?id=123&ref=google` and `?ref=google&id=123` are being treated as two different objects by the cache, even though they return the same content.

## 📖 The Lesson: Query String Normalization

When CloudFront receives a request, the query string is part of the cache key. By default, CloudFront is case-sensitive and order-sensitive. This means:
- `?id=123&ref=google`
- `?ref=google&id=123`
- `?ID=123&REF=google`

... are all treated as **distinct** objects in the cache. This leads to **cache fragmentation**, where your origin server is hit multiple times for the exact same content, simply because the parameters in the URL were arranged differently.

### How Lambda@Edge Helps
By using a `viewer-request` hook, we can intercept the request **before** CloudFront checks its cache. If we "normalize" the query string (e.g., sort the parameters alphabetically), we ensure that all variations of the same request point to the same cache entry. This significantly improves your **Cache Hit Ratio**.

### Using URLSearchParams
Modern JavaScript provides the `URLSearchParams` API, which makes this process much easier. It has a built-in `.sort()` method that handles the alphabetical ordering for you!

> [!TIP]
> **Technical Reference**: For a detailed breakdown of the Lambda@Edge event JSON and how headers are represented, see the [Lambda@Edge Event Structure Guide](../../commons/lambda-at-edge-event.md).

## 🎯 Your Goal
Rewrite the incoming request's query string so that parameters are always sorted alphabetically.

## 📝 Starter Code Template
```javascript
'use strict';

exports.hookType = 'viewer-request';

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    const querystring = request.querystring;

    if (!querystring) return request;

    // TODO: Normalize the querystring
    // const params = new URLSearchParams(querystring);
    // HINT: This sorts 'z=9&a=1' into 'a=1&z=9' every single time.
    // params.sort();
    // request.querystring = params.toString();

    return request;
};
```
*HINT: `URLSearchParams` Already has a alphabetical sort method which simplifies the task.*

## 🛠️ Instructions
1. Open `tutorial/module-1-foundations/exercise-2/index.js`.
2. Use `URLSearchParams` to sort the keys and update `request.querystring`.
3. Run the emulator:
   ```bash
   cloudfrontize www --edge ./tutorial/module-1-foundations/exercise-2/index.js --debug
   ```
>*NOTE*: The `--debug` flag tracks URI rewrites in real-time for logic verification. For a more detailed visual breakdown, use the `--webui` option in your web browser.

4. Test with `http://localhost:3000/?z=last&a=first`.
5. Check the emulator console to see the normalized URL.
You shall see something like this, confirming that the query string has been normalized to `?a=first.&z=last`:
```aiignore
[a4e1cab2] GET /?z=last&a=first. (Host: localhost:3000)
[a4e1cab2] ├─ ○ [L@E: viewer-request] 1.2-librarian.js
[a4e1cab2] ├─ 🌐 [Origin] Fetch (local-origin) ⟹ file://D:\antigravity\cloudfrontize\www/index.html?a=first.&z=last
[a4e1cab2] ╰─ [Response] Status: 200 [29ms]
```

## 💡 Fidelity Tip
Lambda@Edge `viewer-request` functions run **before** the CloudFront cache check. By normalizing here, you ensure that different permutations of the same query string hit the same cache entry!

## 🎓 Learning More
- **AWS Reference**: [Query String Normalization (AWS Docs)](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-examples.html#lambda-examples-query-string-normalization)
- **Keywords**: `Cache Hit Ratio`, `Deterministic Query Strings`, `viewer-request URL rewriting`.
