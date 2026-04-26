# Exercise 2.1: The Scientist

## 🎭 The Scenario
You are running an A/B test. Users in the experiment group have a cookie `experiment=true`. You want them to see the content in the `/experimental/` folder, but they should keep browsing the same URLs (no external redirect).

> **NOTE:** **A/B testing** (also known as split testing) is a method of comparing two versions of a webpage or application feature to determine which one performs better. In the context of Edge logic, this works by splitting incoming traffic so that one segment of users sees **Version A** (the control) while another sees **Version B** (the variation). By using CloudFront at the Edge, we can dynamically route traffic based on a **header** or **cookie**, ensuring a seamless experience without the latency of origin-side processing.


---

## 📖 The Lesson: Internal URI Rewriting

One of the most powerful uses of the `origin-request` hook is **Internal Rewriting**. Unlike a standard **302 Redirect**—which forces the browser to a new URL—an internal rewrite changes the path CloudFront uses to fetch content from the origin **behind the scenes**.

### Why use `origin-request`?
The `origin-request` hook is the perfect place for A/B testing because it runs **after** a cache miss. By rewriting the URI at this stage, you gain three major advantages:

1.  **Clean URLs**: The user's address bar remains `example.com/page`, but CloudFront silently fetches `example.com/experimental/page`.
2.  **Optimized Caching**: CloudFront caches the experimental content separately from the original, even though the external URL is identical. This ensures users in different test groups don't receive the wrong version.
3.  **Reduced Latency**: There is no extra round-trip to the browser. Because the logic stays within the AWS network, the transition to the new content is instantaneous and transparent.



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
And in the WebUI the request shows the redirect:
```aiignore
GET /   40ms
▼
┗━[Origin] Fetch (s3) ⮕ file://D:\antigravity\cloudfrontize\www\experimental\index.html(200)
```

7. **Testing with the WebUI:** We can use the `--webui` option to verify this behavior directly in the browser. Within the WebUI, navigate to the **Header Intelligence** `Viewer` tab and add the header `Cookie` with the value `experiment=true`. Then, visit `http://localhost:3000/index.html`. You will see the content update in your browser while the **Cloudfrontize Console** and **WebUI** display the internal URI rewrite happening in real-time in the background.
>**Troubleshooting Tip:** If you don't see requests reaching the console, your browser is likely serving a cached response. Clear your browser cache or use an **Incognito/Private window** to ensure every request is sent to the server.

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
