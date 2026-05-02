# Exercise 2.1: The Scientist

## 🎭 The Scenario
You are running an A/B test. Users in the experiment group have a cookie `experiment=true`. You want them to see the content in the `/experimental/` folder, but they should keep browsing the same URLs (no external redirect).

> **NOTE:** **A/B testing** (also known as split testing) is a method of comparing two versions of a webpage or application feature to determine which one performs better. In the context of Edge logic, this works by splitting incoming traffic so that one segment of users sees **Version A** (the control) while another sees **Version B** (the variation). By using CloudFront at the Edge, we can dynamically route traffic based on a **header** or **cookie**, ensuring a seamless experience without the latency of origin-side processing.


---

## 📖 The Lesson: Internal URI Rewriting

One of the most powerful uses of the `origin-request` hook is **Internal Rewriting**. Unlike a standard **302 Redirect**—which forces the browser to a new URL—an internal rewrite changes the path CloudFront uses to fetch content from the origin **behind the scenes**.

### Why use `origin-request`?
The `origin-request` hook is the perfect place for A/B testing because it runs **after** a cache miss. As a CloudFront Architect, rewriting the URI at this stage gives you three major advantages:

1.  **Clean URLs (SEO & UX)**: The user's address bar remains `example.com/page`, preserving brand integrity, while CloudFront silently fetches `example.com/experimental/page`.
2.  **Optimized Caching**: CloudFront caches the experimental content separately from the original, even though the external URL is identical. This prevents "test leakage" where users receive the wrong version.
3.  **Reduced Latency**: By staying within the AWS network, you avoid the extra browser round-trip required by a 302 redirect.



### Internal Rewrite vs. External Redirect
To choose the right tool for your logic, keep this comparison in mind:

| Feature | External Redirect (3xx) | Internal Rewrite |
| :--- | :--- | :--- |
| **Browser URL** | Changes to reflect the new location. | Stays exactly the same. |
| **User Experience** | Visible "jump" to a new page. | Seamless and transparent. |
| **Implementation** | Modifies the `Location` header. | Modifies the `request.uri` property. |
| **Best For...** | Domain migrations or SEO redirects. | A/B testing and localized content. |


> [!TIP]
> **Technical Reference**: For a detailed breakdown of the Lambda@Edge event JSON and how headers/cookies are represented, see the [Lambda@Edge Event Structure Guide](../../commons/lambda-at-edge-event.md).
---

## 🎯 Your Goal
Internally rewrite the `request.uri`, for users with the experiment cookie is present. Users with Cookie `experiment=true` should have their requests prefixed with `/experimental`, while all other users should see the original content.

## 📝 Starter Code Template
```javascript
'use strict';

exports.hookType = 'origin-request';

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    const headers = request.headers;

    // TODO: Check for experiment cookie and rewrite URI
    // if (headers.cookie) { ... request.uri = ... }

    return request;
};
```

## 🛠️ Instructions
1. Open `tutorial/module-2-origin/exercise-1/index.js`.
2. Inspect `request.headers.cookie`.
3. If `experiment=true` is found, send them to the `/experimental` folder by prefixing the URI with the string `/experimental`.
4. Run the emulator:
   ```bash
   cloudfrontize www --edge ./tutorial/module-2-origin/exercise-1/index.js --debug --webui 3001  
   ```
   >**Hint**: Enable --debug so you can see the redirects in the console
5. Simulate a request with the cookie: `curl -H "Cookie: experiment=true" http://localhost:3000/index.html`.
6. Verify the console output shows the rewritten path.
In the console, you should see the uri not contains  '/experimental/index.html' instead of '/index.html':
```
[35d7e9e9] GET / (Host: localhost:3000)
[35d7e9e9] ├─ ○ [L@E: origin-request] 2.1-scientist.js
[35d7e9e9] │    [log] ⚡ Rewrite: / -> /experimental/index.html
[35d7e9e9] ├─ ◈ [L@E] Origin Request  ⟹ Rewrote to /experimental/index.html
[35d7e9e9] ├─ 🌐 [Origin] Fetch (local-origin) ⟹ file://cloudfrontize\www\experimental\index.html
[35d7e9e9] ╰─ [Response] Status: 200 [40ms]
```
## 🧪 How to Test

### 1. The Execution Journey (Visual Control Plane)
1.  Open the **WebUI**: `http://localhost:3001`
2.  Trigger a request with the cookie: `curl -H "Cookie: experiment=true" http://localhost:3000/index.html`.
3.  In the **Real-time Edge Traffic** list, click the request row to expand the **Execution Journey**.
4.  In the journey tree, click the **[L@E: origin-request]** station.
5.  In the **State Inspector** panel, verify that the **Header Snapshots** show the `uri` pointing to `/experimental/index.html`.

8. **Testing with the --headers option:** 

    **Pro tip**: Another way to inject the cookie is using the cloudfrontize `--headers` option to inject custom headers and test your requests directly from your browser.
   ```bash
   cloudfrontize www --edge ./tutorial/module-2-origin/exercise-1/index.js --debug --headers sample_headeers.json
   ```
   In this case the header you need to set in `sample_headeers.json` is:
    ```
    {
        "Cookie": "experiment=true"
    }
    ```
   Now open the browser and go to http://localhost:3000/index.html 

## 💡 Fidelity Tip
`origin-request` happens **after** the cache check if there is a miss. By rewriting the URI here, you are telling CloudFront to fetch a different object from the origin and cache it separately for that specific path!

## 🎓 Learning More
- **AWS Reference**: [A/B Testing with Lambda@Edge (AWS Docs)](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-examples.html#lambda-examples-a-b-testing)
- **Keywords**: `origin-request URI rewrite`, `Edge side A/B testing`, `CloudFront Cookie Persistence`.

---

> [!CAUTION]
> ### 🛑 Forensic Troubleshooting: Port 3000 Hangups
> If the emulator fails to start because "Port 3000 is already in use," it means a previous session didn't close properly. 
> 1. Run: `netstat -ano | findstr :3000` to find the PID.
> 2. Run: `taskkill /F /PID <PID_NUMBER>` to clear the ghost process.
