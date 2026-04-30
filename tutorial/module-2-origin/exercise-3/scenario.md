# Exercise 2.3: The Cloaker

## 🎭 The Scenario
Your origin is leaking version data. Since we are serving a static `www` folder, it doesn't naturally produce PHP or Apache headers. To simulate a real-world vulnerable server, we must tell the emulator to "inject" these headers using a headers file or using the WebUI `Header Intelligence`.

## 📖 The Lesson: Security Hardening at the Edge

Exposing the exact version of your server software (like `Apache/2.4.41` or `PHP/5.6.40`) is a major security risk. It gives attackers a clear roadmap of which vulnerabilities to target.

### Why origin-response?
The `origin-response` hook is the perfect place to "sanitize" your headers. By stripping these sensitive headers here, you ensure that:
1.  **Clean Cache**: The headers are removed **before** CloudFront stores the response in its cache.
2.  **Global Protection**: Every user, regardless of whether they hit the cache or the origin, will receive a "cloaked" response.

### Handling Headers
In Lambda@Edge, header keys are always lowercase in the `headers` object. This normalization ensures your code is robust, even if the origin's casing changes.

> [!TIP]
> **Technical Reference**: For a detailed breakdown of the Lambda@Edge event JSON and the specific "Fidelity Map" structure used for headers, see the [Lambda@Edge Event Structure Guide](../../commons/lambda-at-edge-event.md).

## 🎯 Your Goal
Strip the `Server` and `X-Powered-By` headers at the **Edge** before they are cached by CloudFront.

---

## 📝 Starter Code Template
```javascript
'use strict';

exports.hookType = 'origin-response';

exports.handler = async (event) => {
    const response = event.Records[0].cf.response;
    const headers = response.headers;

    // TODO: Clean up headers
    // delete headers['some-header'];

    return response;
};
```

## 🛠️ Instructions
1. Open `tutorial/module-2-origin/exercise-3/index.js`.
2. Delete the offending headers.
3. Create a file named `origin-headers.json`. Add the headers:
```json
{
  "ResponseHeaders": {
    "Server": "Apache/2.4.41 (Ubuntu)",
    "X-Powered-By": "PHP/5.6.40"
  }
}
```
>**HINT**: This is a particular case compared to the previous exercises. While previously we focused on injecting `Request Headers`, here we must define `Response Headers`. To simulate an origin server's behavior, use the key `ResponseHeaders` in your JSON file (passing a list of key:value pairs as you see in the sample above). This allows you to simulate headers coming from the origin server, which your Lambda@Edge function can then intercept and manipulate before they ever reach the browser!!

>**HINT**: If you prefer, you can inject these same headers using the **Header Intelligence** feature in the **WebUI**. Just ensure you set them in the **Origin** tab rather than the **Viewer** tab..


3. Run the emulator:
   ```bash
   cloudfrontize www --edge ./tutorial/module-2-origin/exercise-3/index.js --headers origin-headers.json --debug --webui 3001 
   ```
4. You will see `origin-response`, with the headers injected.
5. Inspect the response in your browser/curl and ensure the headers are gone.
```bash
curl -I http://localhost:3000/index.html
```
6. Since the headers are injected directly at the origin, the only way you will be able to withness the changes is with the WebUI. For this, select one request, for instance `GET /`  and in the `Execution Journey` you will see the `Origin Returned` headers, you will see the injected headers in there, and if you look at the `Final Response` section, the headers are gone. If you inspect the journey step-by-step, you will see the headers are deleted at the L@E function.

**The Test:**

* **Test A (The Leak):** Comment out your `delete` lines and run the `curl` command. You should see the Apache/PHP versions from your JSON file.
* **Test B (The Cloak):** Uncomment the code. Run `curl` again. Those headers should be gone.

>**HINT**: Notice Cloudfrontize support hot reload, so you don't need to restart the application as you comment or uncomment sections of the code, just save the file and the changes are applied automatically.

## 💡 Fidelity Tip
`origin-response` is the best place for this because it cleans the headers **before** they enter the CloudFront cache. If you used `viewer-response`, CloudFront would still be caching the "dirty" headers!

## 🎓 Learning More
- **AWS Reference**: [Modifying Response Headers in origin-response (AWS Docs)](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-examples.html#lambda-examples-modifying-response-headers-origin-response)
- **Keywords**: `origin-response`, `Response Header Stripping`, `Edge Security Hardening`.
