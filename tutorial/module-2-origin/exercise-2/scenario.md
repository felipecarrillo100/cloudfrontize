# Exercise 2.2: The Diplomat

## 🎭 The Scenario
Your marketing team wants a "localized" experience. Instead of one global `index.html`, they want users to automatically see content for their country (e.g., `/GB/index.html` for UK users).

## 📖 The Lesson: Geo-Localization at the Edge

CloudFront provides built-in headers that identify the viewer's location, such as `CloudFront-Viewer-Country`, `CloudFront-Viewer-City`, and even latitude/longitude.

### The Power of Origin Request
As a CloudFront Consultant, you know that using these headers in an `origin-request` hook allows for seamless personalized content delivery without managing complex routing logic on your backend. This enables:
- **Automatic Language Selection**: Route users to their native language folder automatically based on high-fidelity geo-data.
- **Regulatory Compliance (GDPR/CCPA)**: Dynamically show different Terms of Service or Cookie banners based on the user's country with zero origin overhead.

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
## 🧪 How to Test

### 1. The Execution Journey (Visual Control Plane)
1.  Open the **WebUI**: `http://localhost:3001`
2.  In the **Intelligence Panel**, use the **Geo Presets** to select `France (FR)`. Click **Apply Changes**.
3.  Refresh `http://localhost:3000/index.html`.
4.  In the **Real-time Edge Traffic** list, click the request row to expand the **Execution Journey**.
5.  In the journey tree, click the **[L@E: origin-request]** station. 
6.  In the **State Inspector** panel, verify that the **Header Snapshots** show the `uri` pointing to `/countries/FR/index.html`.

### 2. Verification with `curl`
```bash
curl -v -H "CloudFront-Viewer-Country: MX" http://localhost:3000/index.html
```
*   **Result**: Check for `REWRITE: /index.html -> /countries/MX/index.html` in the terminal logs.
*   **Web UI Audit**: In the **Execution Journey**, confirm the `origin-request` station shows the PIVOT to the Mexican subfolder.

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

>**NOTE**: Keep the `-mode website` in mind, as we will use it frequently throughout this tutorial. It is an excellent tool for simplifying your code, allowing you to focus on the core logic of your Lambda@Edge functions without the distraction of path resolution issues.
---
## 🎓 Learning More
- **AWS Reference**: [Localized Content (AWS Docs)](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-examples.html#lambda-examples-localized-content)
- **Keywords**: `CloudFront-Viewer-Country`, `origin-request localization`, `Multi-region content strategies`.

---

> [!CAUTION]
> ### 🛑 Forensic Troubleshooting: Port 3000 Hangups
> If the emulator fails to start because "Port 3000 is already in use," it means a previous session didn't close properly. 
> 1. Run: `netstat -ano | findstr :3000` to find the PID.
> 2. Run: `taskkill /F /PID <PID_NUMBER>` to clear the ghost process.
