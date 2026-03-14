# Exercise 2.2: The Diplomat

## 🎭 The Scenario
Your marketing team wants a "localized" experience. Instead of one global `index.html`, they want users to automatically see content for their country (e.g., `/GB/index.html` for UK users).

## 🎯 Your Goal
Prepend the country code from the `CloudFront-Viewer-Country` header to the URI. 

For this demo, you can use the `www` folder, which already contains subfolders like countries/<code>. You can redirect requests to the appropriate subfolder based on headers['cloudfront-viewer-country']

## 🛠️ Instructions
1. Open `tutorial/module-2-origin/exercise-2/index.js`.
2. Grab the value from `headers['cloudfront-viewer-country']`.
3. Update `request.uri`.
4. Run the emulator:
   ```bash
   cloudfrontize www --edge ./tutorial/module-2-origin/exercise-2/index.js --debug
   ```
   **HINT** use the --debu option to display the redirects in the console
5. Test with a custom header: `curl -H "CloudFront-Viewer-Country: MX" http://localhost:3000/index.html`.
6. Verify in the console the requested path becomes `countries/MX/index.html`.

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


## 🎓 Learning More
- **AWS Reference**: [Localized Content (AWS Docs)](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-examples.html#lambda-examples-localized-content)
- **Keywords**: `CloudFront-Viewer-Country`, `origin-request localization`, `Multi-region content strategies`.
