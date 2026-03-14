# Exercise 2.3: The Cloaker

## 🎭 The Scenario

Your origin is leaking version data. Since we are serving a static `www` folder, it doesn't naturally produce PHP or Apache headers. To simulate a real-world vulnerable server, we must tell the emulator to "inject" these headers using a configuration file.

## 🎯 Your Goal

Strip the `Server` and `X-Powered-By` headers at the **Edge** before they are cached by CloudFront.

## 🧠 The "Fidelity Map" Rule

AWS CloudFront normalizes all header keys to **lowercase** in the `headers` object. To delete them, you must reference that lowercase key, even if the origin sent them with capital letters.

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


3. Run the emulator:
   ```bash
   cloudfrontize www --edge ./tutorial/module-2-origin/exercise-3/index.js --headers origin-headers.json --debug 
   ```
4. You will see `origin-response`, with the headers injected.
5. Inspect the response in your browser/curl and ensure the headers are gone.
```bash
curl -I http://localhost:3000/index.html
```
**The Test:**

* **Test A (The Leak):** Comment out your `delete` lines and run the `curl` command. You should see the Apache/PHP versions from your JSON file.
* **Test B (The Cloak):** Uncomment the code. Run `curl` again. Those headers should be gone.


## 💡 Fidelity Tip
`origin-response` is the best place for this because it cleans the headers **before** they enter the CloudFront cache. If you used `viewer-response`, CloudFront would still be caching the "dirty" headers!

## 🎓 Learning More
- **AWS Reference**: [Modifying Response Headers in origin-response (AWS Docs)](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-examples.html#lambda-examples-modifying-response-headers-origin-response)
- **Keywords**: `origin-response`, `Response Header Stripping`, `Edge Security Hardening`.
