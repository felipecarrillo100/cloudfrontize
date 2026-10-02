# Exercise 1.3: The Concierge

## 🎭 The Scenario
You have a legacy frontend that looks terrible on phones. You've built a shiny new mobile site at `m.example.com`. You want to redirect mobile users before they even hit your origin.

## 📖 The Lesson: Intelligent Redirection

Sometimes you need to serve specific content based on a user’s device or location—for example, redirecting mobile users to a site specifically optimized for smaller screens. Rather than letting those requests travel all the way to your origin only to be sent back, you can handle the redirection at the **Edge** for a faster, more seamless user experience.


### Short-Circuiting the Request: The Architect's Secret
One of the most powerful features of `viewer-request` is the ability to **short-circuit**. If your function returns a `response` object instead of the `request` object, CloudFront immediately returns that response to the user and **skips the origin entirely**. 

As an Architect, this is your "Instant Response" lever. It is incredibly fast, saves origin costs, and is the foundation for Edge-side Auth, maintenance pages, and intelligent routing.

### CloudFront Device Detection
CloudFront can automatically detect the viewer's device type (mobile, tablet, desktop, smart TV) and inject headers like `CloudFront-Is-Mobile-Viewer: true`. By using these headers at the Edge, you can create a "Concierge" service that routes users to the best experience for their hardware.

> [!IMPORTANT]
> **AWS doesn't show CloudFront's device headers to a Lambda@Edge viewer-request function.** *"CloudFront adds the headers after the viewer request event, which means the headers aren't available to Lambda@Edge functions in a viewer request."* This exercise only works when the **viewer itself** sends the header (the `curl -H` test below). CloudFrontize follows the AWS rule, so the WebUI **Device Emulation** presets and `--headers` files, which simulate what CloudFront adds, are **not** visible to this function.
> In production, do this with a **CloudFront Function**, which can read device headers on viewer-request. See the CloudFrontize 3 version: [1.3 The Concierge](../../v3/01-foundations/1.3-concierge/README.md).

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
## 🧪 How to Test

### 1. Verification with `curl`
```bash
curl -I -H "CloudFront-Is-Mobile-Viewer: true" http://localhost:3000/any-page
```
*   **Result**: Look for `HTTP/1.1 302 Found` and `Location: https://m.example.com/any-page`.
*   **Terminal Log Check**: Verify the `[L@E: Concierge] Mobile Redirect` log message.

### 2. The Execution Journey (Visual Control Plane)
1.  Open the **WebUI**: `http://localhost:3001` and send the `curl` request above.
2.  In the **Real-time Edge Traffic** list, click the request row to expand the **Execution Journey**.
3.  In the journey tree, click the **[L@E: viewer-request]** station. Notice the **Short-Circuit** behavior: the request highway ends here because you returned a response object.

> [!NOTE]
> Selecting the `Mobile` **Device Emulation** preset doesn't trigger the redirect here: it simulates the header CloudFront adds, which a Lambda@Edge viewer-request function never sees in AWS.
---

### 💡 Pro Tip: Where Header Simulation Works

`--headers` files and the WebUI presets simulate the headers **CloudFront adds**. Lambda@Edge sees those only in **origin-request** and **origin-response**, while CloudFront Functions see them on viewer events too. For a Lambda@Edge viewer-request function like this one, send the header from the client (`curl -H`), which is the only way it would reach this function in AWS.

---

## 💡 Fidelity Tip
In AWS, to use device-detection headers, you must first enable them in your **CloudFront Origin Request Policy**. CloudFrontize applies AWS's visibility rule: simulated device headers reach CloudFront Functions and Lambda@Edge origin events, not Lambda@Edge viewer events.

## 🎓 Learning More
- **AWS Reference**: [Redirecting Mobile Users (AWS Docs)](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-examples.html#lambda-examples-redirecting-mobile-users)
- **Keywords**: `viewer-request redirect`, `CloudFront device detection headers`, `302 Found response`.

---

> [!CAUTION]
> ### 🛑 Forensic Troubleshooting: You see a 404
> Do not worry about that, that is perfectly normal. Our exercise redirects the users to `http://m.example.com`, a site that does not exist
> This exercise focuses on performing a 302 redirect, not on building the website itself. If you prefer, you can::
> 1. Redirect the users to a real website, for example `https://www.amazon.com/` or `https://www.google.com/` 
> 2. Or you could redirect to a subdirectory within your own site. If you choose this path, ensure your logic is sound to avoid infinite redirect loops, where the user is trapped by repeatedly triggering the same redirect rule.
