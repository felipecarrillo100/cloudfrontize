# Exercise 1.3: The Concierge

## 🎭 The Scenario
You have a legacy frontend that looks terrible on phones. You've built a shiny new mobile site at `m.example.com`. You want to redirect mobile users before they even hit your origin.

## 📖 The Lesson: Intelligent Redirection

Sometimes you need to serve specific content based on a user’s device or location—for example, redirecting mobile users to a site specifically optimized for smaller screens. Rather than letting those requests travel all the way to your origin only to be sent back, you can handle the redirection at the **Edge** for a faster, more seamless user experience.


### Short-Circuiting the Request
One of the most powerful features of `viewer-request` is the ability to **short-circuit**. If your function returns a `response` object instead of the `request` object, CloudFront immediately returns that response to the user and **skips the origin entirely**. This is incredibly fast and saves origin resources.

### CloudFront Device Detection
CloudFront can automatically detect the viewer's device type (mobile, tablet, desktop, smart TV) and inject headers like `CloudFront-Is-Mobile-Viewer: true`. By using these headers at the Edge, you can create a "Concierge" service that routes users to the best experience for their hardware.

> [!TIP]
> **Technical Reference**: For a detailed breakdown of the Lambda@Edge event JSON and how headers are represented, see the [Lambda@Edge Event Structure Guide](../../commons/lambda-at-edge-event.md).

## 🎯 Your Goal
Return a `302 Found` response for any mobile users, pointing them to the mobile domain (i.e. https://m.example.com) while preserving their path and query parameters.

## 📝 Starter Code Template
```javascript
'use strict';

exports.hookType = 'viewer-request';

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    const headers = request.headers;

    // TODO: Detect mobile and redirect
    // const isMobile = headers['cloudfront-is-mobile-viewer'] && ...
    // If it's a mobile viewer, return a response object with status '302' and a 'location' header pointing to the mobile site.
    // Redirect them to your mobile website using header location, i.e 'https://m.example.com/'
    // Pass curernt path (request.uri) and query paramters (request.querystring)

    return request;
};
```

## 🛠️ Instructions
1. Open `tutorial/module-1-foundations/exercise-3/index.js`.
2. Check for the `cloudfront-is-mobile-viewer` header.
3. If true, return a response object with `status: '302'`.
4. Run the emulator:
   ```bash
   cloudfrontize www --edge ./tutorial/module-1-foundations/exercise-3/index.js --webui 3001
   ```
5. Use a tool like Postman or `curl` to send a request with the header `CloudFront-Is-Mobile-Viewer: true`.
```shell
curl -v -H "CloudFront-Is-Mobile-Viewer: true" http://localhost:3000/
```
> **Success Criteria:** Your terminal should show `HTTP/1.1 302 Found` and the `location` header you defined.

6. In **Cloudfrontize WebUI**: Use the **Header Intelligence** feature to manipulate headers within the `Viewer` tab. For example, adding CloudFront-Is-Mobile-Viewer: true allows you to simulate a mobile request and observe the redirection. This tool enables you to test CloudFront headers directly in the browser, eliminating the need for curl.
7. **Test the Redirection:** In the WebUI, select the **Mobile** preset and click **Apply Changes**. Then, load `localhost:3000/mypath?test=123` in your browser. You will see the redirection in action as it sends you to `https://m.example.com/mypath?test=123`, demonstrating that both the path and query parameters are successfully preserved.

**In the Cloudfrontize console and WebUI,** you will observe that the origin is never reached. Instead, the response is returned immediately with a `302` status code, confirming the redirection happened entirely at the Edge.
```
[ad86c970] GET /anc/?a=2 (Host: localhost:3000)
[ad86c970] ├─ ○ [L@E: viewer-request] 1.3-concierge.js
[ad86c970] ├─ ◈ [L@E: viewer-request] Generated Response
[ad86c970] ╰─ [Response] Status: 302 [2ms]
```

>**HINT / Troubleshooting**. If you don't see your request reaching the Cloudfrontize console or WebUI, you may need to clear your browser cache or use an Incognito/Private window to ensure the request is actually sent rather than served from the local cache.
---

### 💡 Pro Tip: Persistent Header Simulation

As an alternative to the Header Intelligence in the WbUI. You can also tell the `cloudfrontize` emulator to **always** inject specific headers by creating a `headers.json` file with the `--headers` option:

Create `header.json`
```json
{ 
  "CloudFront-Is-Mobile-Viewer": "true"
}
```
And start the emulator as:
```bash
   cloudfrontize www --edge ./tutorial/module-1-foundations/exercise-3/index.js --headers ./headers.json
```
Now, any standard browser refresh at http://localhost:3000 will behave as a mobile device and you will be redirected to the page you set `https://m.example.com/` 

## 💡 Fidelity Tip
In AWS, to use device-detection headers, you must first enable them in your **CloudFront Origin Request Policy**. The emulator simulates these headers being present by default to make development easier.

## 🎓 Learning More
- **AWS Reference**: [Redirecting Mobile Users (AWS Docs)](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-examples.html#lambda-examples-redirecting-mobile-users)
- **Keywords**: `viewer-request redirect`, `CloudFront device detection headers`, `302 Found response`.
