# 2.2 The Diplomat

## 🎭 The Scenario
Marketing wants a localized site. Instead of one global `index.html`, visitors from France should see `/countries/FR/`, visitors from Mexico `/countries/MX/`, and everyone else the US site. Your backend shouldn't need to know anything about geography.

## 📖 The Lesson

### CloudFront knows where the viewer is
CloudFront can add **viewer location** headers to the request, worked out from the viewer's IP address: `CloudFront-Viewer-Country`, `CloudFront-Viewer-City`, `CloudFront-Viewer-Time-Zone`, latitude and longitude, and more. It adds them only when a **cache policy** or **origin request policy** asks for them.

### Why this runs on origin-request
*When* CloudFront adds these headers matters:

> *"CloudFront adds the headers after the viewer request event, which means the headers aren't available to Lambda@Edge functions in a viewer request. The headers are only available to Lambda@Edge functions in an origin request and origin response."*

So a Lambda@Edge function that reads `CloudFront-Viewer-Country` belongs on **origin-request**. On viewer-request it would never see CloudFront's value. (CloudFront Functions are different: they *can* read location and device headers on viewer events. See [1.3 The Concierge](../../01-foundations/1.3-concierge/README.md).)

### Viewers can't fake it
What if a viewer sends its own `CloudFront-Viewer-Country: MX`? AWS:

> *"CloudFront overwrites the header values that were in the viewer request. Viewer-facing functions see the header value from the viewer request, while origin-facing functions see the header value that CloudFront added."*

Your origin-request function always gets CloudFront's value, so geo rules there can't be bypassed with `curl -H`.

### Rewriting, not redirecting
Changing `request.uri` in origin-request is an **internal rewrite**: the viewer still sees `/index.html` in the address bar, and CloudFront fetches `/countries/FR/index.html` from the origin. It stays on the same cache behavior and origin: *"If a function changes the URI for a request, that doesn't change the cache behavior for the request or the origin that the request is forwarded to."*

## 🗂️ This Project

| Path | What it is |
|---|---|
| `functions/lambda-edge/origin-request.diplomat.js` | The Lambda@Edge function, on **origin-request** |
| `origins/www/countries/<code>/index.html` | One site per country (FR, MX, US) |
| `viewer-headers.json` | The viewer simulation: CloudFront says this visitor is in France |
| `cloudfrontize.json` | The function, and `"viewer": { "headers": "viewer-headers.json" }` |
| `checks.json` | What this tutorial must do, checked automatically |

## 🎯 Your Goal
Read the country from `request.headers['cloudfront-viewer-country']`, and rewrite the URI to `/countries/<code>/…`. Countries without their own folder get the US site, and folder requests (`/`) get `index.html`, because S3 REST origins don't add it. To practice, replace the function with:

```javascript
'use strict';
exports.hookType = 'origin-request';

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    // TODO: read cloudfront-viewer-country and rewrite request.uri
    return request;
};
```

## 🛠️ Run It
From this folder:
```bash
cloudfrontize validate
cloudfrontize --webui
```

## 🧪 How to Test
```bash
curl -s http://localhost:3000/index.html | grep '<h1>'          # 🐶 Académie Paws
curl -s -H "CloudFront-Viewer-Country: MX" http://localhost:3000/index.html | grep '<h1>'   # still French
```
The second request is the "viewers can't fake it" rule in action. To be a visitor from Mexico, change the country the way CloudFront would: edit `viewer-headers.json` and restart CloudFrontize, or pick a **Geo preset** in the WebUI. In the WebUI's journey, the **[L@E: origin-request]** step shows the header and the rewritten URI.

## 💡 Fidelity Tips
- **Add the header to the cache key.** If content varies by country, include `CloudFront-Viewer-Country` in the **cache policy**. Otherwise the first visitor's country is cached and served to everyone.
- **In AWS you have to ask for the header.** CloudFront adds location headers only when a cache or origin request policy includes them.
- **Not every IP can be located precisely.** `CloudFront-Viewer-City`, `-Metro-Code` and `-Postal-Code` *"might not be available for every IP address"*, so always have a fallback.

## 🎓 Learning More
- **AWS**: [Add CloudFront request headers](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/adding-cloudfront-headers.html)
- **AWS**: [Restrictions on Lambda@Edge › CloudFront headers](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-at-edge-function-restrictions.html#lambda-at-edge-restrictions-cloudfront-headers)
- **AWS**: [Example: serve content based on country](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-examples.html)
