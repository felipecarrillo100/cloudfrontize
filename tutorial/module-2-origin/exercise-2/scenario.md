# Exercise 2.2: The Diplomat

## 🎭 The Scenario
Your marketing team wants a "localized" experience. Instead of one global `index.html`, they want users to automatically see content for their country (e.g., `/GB/index.html` for UK users).

## 📖 The Lesson: Geo-Localization at the Edge

CloudFront provides built-in headers that identify the viewer's location, such as `CloudFront-Viewer-Country`, `CloudFront-Viewer-City`, and even latitude/longitude.

### The Power of Origin Request
By using these headers in an `origin-request` hook, you can serve personalized content without managing complex routing logic on your backend. This allows for:
- **Automatic Language Selection**: Route users to their native language folder automatically.
- **Regulatory Compliance**: Show different Terms of Service or Cookie banners based on the user's country (e.g., GDPR in the EU).

### ⚠️ The Cache Key Warning
When you use geo-headers to change content, you **must** ensure that those headers are included in your **Cache Policy**. If you don't, CloudFront might cache the US version of your site and serve it to a user in France! By including the country header in the cache key, CloudFront treats every country as a unique cache entry.

> [!TIP]
> **Technical Reference**: For a detailed breakdown of the Lambda@Edge event JSON and how headers are represented, see the [Lambda@Edge Event Structure Guide](../../commons/lambda-at-edge-event.md).

## 🎯 Your Goal
Prepend the country code from the `CloudFront-Viewer-Country` header to the URI. 

For this demo, you can use the `www` folder, which already contains subfolders like countries/code. You can redirect requests to the appropriate subfolder based on headers['cloudfront-viewer-country'].

## 🛠️ Instructions
1. Open `tutorial/module-2-origin/exercise-2/index.js`.
2. Grab the value of the country from `headers['cloudfront-viewer-country']`.
3. Update `request.uri` (internal rewrite) redirecting ro a different folder based on the country.
4. Run the emulator:
   ```bash
   cloudfrontize www --edge ./tutorial/module-2-origin/exercise-2/index.js --debug --webui 3001
   ```
   **HINT** use the --debu option to display the redirects in the console
5. **Testing with curl**: add the custom header: `curl -H "CloudFront-Viewer-Country: MX" http://localhost:3000/index.html`.
6. Verify in the console the requested path becomes `countries/MX/index.html`.

7. **Testing with WebUI**: Open the webui `localhost:3001`. Then from the "Headers Intelligence" panel wick the `Viewer` tab, add the header `CloudFront-Viewer-Country` header with a value (e.g., `FR` for France). Click on `Apply Changes`. Load page and verify that you are redirected to the correct country folder.
    > **HINT** You can click on the preset-buttons to pick a country and set the corresponding headers automatically.

## 💡 Fidelity Tip
When using Geo-headers, remember to include them in the **CloudFront Cache Key** (via Cache Policy), otherwise, the first user's country-specific content might be served to everyone!

## ✨ Test Like a pro
You can inject the country header using the cloudfrontize `--headers` option.

1. Create a headers file `header.json`.
```json
{
  "CloudFront-Viewer-Country": "FR"
}
```
2. Run the emulator:
```bash
cloudfrontize www --edge ./tutorial/module-2-origin/exercise-2/index.js --headers ./header.json --debug
```
3. Open the URL in your browser: http://localhost:3000/index.html. You should be redirected to the France site.
4. Stop Cloudfrontize, then edit `header.json` to set a different country code (e.g., MX, RU, CN, US).
5. Repeat the process to test all available countries. If a country is not available, the site defaults to US.


### 💡 Pro-Tip: Path Resolution & Website Mode

You may have noticed that we are calling `http://localhost:3000/index.html` explicitly instead of using the root `http://localhost:3000/`. This was done intentionally to keep the tutorial code focused and simple.

In a production **Lambda@Edge** environment, subfolders do not automatically append `/index.html` to the request path. To handle this, you generally have two options:

1. **Custom Logic:** Implement path resolution directly in your function code, as demonstrated in the solution for **Exercise 2.1**.
2. **Website Mode:** Alternatively, you can instruct **CloudFrontize** to treat your content as a static site by using the `--mode website` flag. This will automatically append `index.html` to directory requests for you.

```bash
   cloudfrontize www --edge ./tutorial/module-2-origin/exercise-2/index.js --headers ./header.json --debug --mode website
```
---
## 🎓 Learning More
- **AWS Reference**: [Localized Content (AWS Docs)](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-examples.html#lambda-examples-localized-content)
- **Keywords**: `CloudFront-Viewer-Country`, `origin-request localization`, `Multi-region content strategies`.
