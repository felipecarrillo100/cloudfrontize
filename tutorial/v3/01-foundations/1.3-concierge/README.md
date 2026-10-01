# 1.3 The Concierge

## 🎭 The Scenario
Your legacy frontend looks terrible on phones. You've built a new mobile site at `m.example.com`, and you want phones redirected there **before** the request reaches your origin.

## 📖 The Lesson

### CloudFront knows the device
Based on the `User-Agent`, CloudFront can add **device type** headers set to `true` or `false`: `CloudFront-Is-Mobile-Viewer`, `CloudFront-Is-Tablet-Viewer`, `CloudFront-Is-Desktop-Viewer`, `CloudFront-Is-SmartTV-Viewer`, `CloudFront-Is-IOS-Viewer` and `CloudFront-Is-Android-Viewer`. A tablet can be both mobile and tablet.

### Why a CloudFront Function, not Lambda@Edge
The 2.x version of this tutorial used a **Lambda@Edge viewer-request** function. In AWS that doesn't work:

> *"CloudFront adds the headers after the viewer request event, which means the headers aren't available to Lambda@Edge functions in a viewer request."*

A Lambda@Edge viewer-request function only sees the header if the *viewer itself* sent it, which real phones don't. **CloudFront Functions** do have the data. In AWS's comparison of the two, *"Access to geolocation and device data"* is **Yes** for CloudFront Functions and **No (viewer request and viewer response)** for Lambda@Edge. A redirect like this is also the kind of short, high-volume job CloudFront Functions are made for.

CloudFrontize applies the same rule, so the Lambda@Edge version silently never redirects, just as it would in production.

### Short-circuiting
Returning a **response** instead of the request ends the trip there: CloudFront answers the viewer immediately, and the origin never sees the request. In a CloudFront Function, a response has `statusCode`, `statusDescription` and `headers`, with each header as `{ value }`.

## 🗂️ This Project

| Path | What it is |
|---|---|
| `functions/cloudfront/viewer-request.concierge.js` | The CloudFront Function (runtime 2.0), on **viewer-request** |
| `cloudfrontize.json` | The function on the default behavior |
| `checks.json` | What this tutorial must do, checked automatically |

## 🎯 Your Goal
When `cloudfront-is-mobile-viewer` is `true`, return a `302` to `https://m.example.com`, keeping the path and the query string. Otherwise return the request. In CloudFront Functions, `request.querystring` is an object (`{ id: { value: '7' } }`), so you rebuild the `?…` part yourself. To practice, replace the function with:

```javascript
async function handler(event) {
    const request = event.request;
    // TODO: redirect mobile viewers to https://m.example.com + path + query string
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
curl -sI -H "CloudFront-Is-Mobile-Viewer: true" "http://localhost:3000/products/index.html?id=7"
# 302, Location: https://m.example.com/products/index.html?id=7
curl -sI http://localhost:3000/products/index.html     # 200
```
Here the header you send stands in for the one CloudFront would add. You can also pick **Device → iPhone** in the workbench's **Viewer** inspector and save (it writes `config/headers.json`), or reference a headers file yourself with `"viewer": { "headers": … }` in `cloudfrontize.json`. A simulated value is what CloudFront adds, so it overrides anything the client sends.

The `302` points to `m.example.com`, which doesn't exist, so a browser that follows it will fail. That's expected: this exercise is about the redirect.

## 💡 Fidelity Tips
- **In AWS you have to ask for the headers.** CloudFront adds device headers only when a cache or origin request policy includes them.
- **Add them to the cache key** if the response varies by device, or a cached desktop page can be served to phones (and the other way round).
- **Need Lambda@Edge anyway?** Then read the device headers in an **origin-request** function, where CloudFront's values are available. A redirect there only happens on cache misses, so it isn't the right place for this job.

## 🎓 Learning More
- **AWS**: [Add CloudFront request headers › Device type headers](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/adding-cloudfront-headers.html#cloudfront-headers-device-type)
- **AWS**: [Differences between CloudFront Functions and Lambda@Edge](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/edge-functions-choosing.html)
- **AWS**: [CloudFront Functions event structure](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/functions-event-structure.html)
