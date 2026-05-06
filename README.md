# cloudfrontize

[![Sponsor](https://img.shields.io/badge/Sponsor-❤️-ff69b4?style=for-the-badge&logo=github)](https://github.com/sponsors/felipecarrillo100)
![npm](https://img.shields.io/npm/v/cloudfrontize)
![node](https://img.shields.io/node/v/cloudfrontize)

📜 **Changelog:** See [CHANGELOG.md](CHANGELOG.md) for release history.

---

#### A high-fidelity local development server for AWS Lambda@Edge and CloudFront Functions.

Test your Edge logic locally in milliseconds instead of waiting 15 minutes for CloudFront deployments.

| CloudFrontize Console                                                                                                    | CloudFrontize Web UI |
|--------------------------------------------------------------------------------------------------------------------------|--------------------|
| ![Cloudfrontize Banner](https://raw.githubusercontent.com/felipecarrillo100/cloudfrontize/main/assets/cloudfrontize.png) | ![CloudFrontize Pro Dashboard](https://raw.githubusercontent.com/felipecarrillo100/cloudfrontize/main/assets/cloudfrontize-pro-ui.png) |

---
## 📦 Getting started

Run a local CloudFront simulation in seconds. No complex AWS IAM roles, no stack traces—just your code, running locally.

### ⚡ Try instantly (no install)
```bash
npx --yes cloudfrontize ./www --edge ./viewer-request-rewrite.js
```
### 📦 Or install globally

```bash
npm install -g cloudfrontize
```

Once installed, run CloudFrontize from any directory:

```bash
cloudfrontize ./www --edge ./viewer-request-rewrite.js
```

Point it at your static files folder (`./www`, `./dist`, or `./public`) and your Lambda@Edge `.js` file—CloudFrontize handles the rest.

> 💡 Tip: Add `--webui 3001` to enable the **[Visual Control Plane](docs/web-ui.md)** for live debugging in your browser.

---
## ⚡ Quick Example

1️⃣ Create a simple Lambda@Edge function, for instance: `viewer-request-rewrite.js`

```javascript
exports.hookType = 'viewer-request';

exports.handler = (event, context, callback) => {
    const request = event.Records[0].cf.request;
    console.log("Original request", request.uri);
    request.uri = "/index-alt.html";
    callback(null, request);
};
```

2️⃣ Run CloudFrontize

```
cloudfrontize ./www --edge ./viewer-request-rewrite.js --debug
```
For this sample, place two HTML files inside the `www` folder: `index.html` and `index-alt.html`.

3️⃣ Open

Open your browser and navigate to: http://localhost:3000

Because the `viewer-request` hook is active, every request is rewritten to `/index-alt.html`. As a result, the browser will display the contents of that file regardless of the requested path.

Check the CloudFrontize terminal output. You should see a log entry confirming the internal URI rewrite:
```text
2026-03-16T22:18:51.465Z  [44ff0e42] [viewer-request]  Original request /
[Debug] Mode: rest, isRestMode: true, URL: /index-alt.html, FullPath: C:\tmp\www\index-alt.html
```

---

## 📣 Stop waiting for CloudFront deployments! 

**Take control** of your Edge development workflow. **Escape the "Deploy-and-Pray" cycle.** We’ve all been there: you tweak one security header, hit "Deploy," and... **you wait.** For 15 agonizing minutes, you watch a spinning "In Progress" status as AWS propagates your code globally. If there’s a tiny typo? You won't know until you hit a **502 Bad Gateway** and go hunting through CloudWatch logs buried in a random region.

It’s a workflow that kills momentum and turns "quick fixes" into afternoon-long ordeals.

### 👑 Enter CloudFrontize

The ultimate developer productivity tool for AWS CloudFront Functions and Lambda@Edge. It transforms your local static server into a **high-fidelity AWS Edge Location simulation.**

* **Kill the Lag:** Test in milliseconds, not minutes.
* **Catch the 502s Locally:** Validate headers and URI rewrites before they ever touch an AWS environment.
* **Stay in the Flow:** Stop wasting hours in the "Deploy → Wait → Check Logs → Fail" loop.

**Start shipping rock-solid Edge logic with total confidence.**

---

## ⚡ Why Developers & SysAdmins Need This

The CloudFront/Lambda@Edge development loop is notoriously painful. Propagation takes minutes, debugging requires digging through CloudWatch, and a single header typo can bring down your entire production distribution with a **502 Bad Gateway**.

**CloudFrontize** eliminates the wait and the risk:

* **Zero-Config Integration:** If you know how to use Vercel's [serve](https://www.npmjs.com/package/serve) package, you already know how to use `cloudfrontize`.
* **Real-Time Hot Reloading:** Tweak your URI rewrites or security headers and see the results instantly on browser refresh. No packaging, no uploading, no waiting for the "In Progress" spinner.
* **Debug directly to the console:** Stop hunting for logs in hidden CloudWatch streams across random regions. See your console.log outputs and execution errors live **in your terminal**. 
* **Production Fidelity:** Emulates in detail CloudFront-specific features & quirks, like the **10MB auto-compression limit**, header blacklisting, and URI normalization.
* **RequestBody Support:** Access the request payload in your hooks for webhook validation or body-based routing.
* **The "Safety Net":** Catch forbidden header mutations or invalid response structures locally. Use `--strict` to auto-fail requests that violate AWS limits (40KB body, 1MB generated response).

---

## 🧩 Real-World Use Cases

Bring your Edge logic to life with scenarios you actually face in production:

* **A/B testing without cache fragmentation**
  Run experiments at the edge without destroying cache efficiency or increasing origin load.

* **Geo-based content routing**
  Serve localized content instantly using `CloudFront-Viewer-Country`—no backend needed.

* **Auth at the edge**
  Protect routes with Basic Auth, JWT validation, or custom logic *before* requests hit your origin.

* **Security header enforcement**
  Inject and validate headers like CSP, HSTS, and CORS consistently across all responses.


> 💡 All of these are covered step-by-step in the **[CloudFrontize Academy](./tutorial/README.md)**

---

## ⚖️ Value Proposition & Market Comparison

While tools like `serverless-offline` or `SAM CLI` are great for standard Lambda functions, they often fall short when it comes to the specific, high-stakes constraints of the **AWS Edge**.

| Feature | CloudFrontize | Other Local Simulators |
| --- | --- | --- |
| **Edge Fidelity** | 🎯 Built specifically for the 4 CloudFront triggers. | ⚠️ Usually limited to generic API Gateway events. |
| **Limits Enforcement** | ✅ Enforces 40KB body & 1MB response limits. | ❌ Generally ignores Edge-specific size limits. |
| **Header Validation** | ✅ Warns/Fails on forbidden header mutations. | ❌ Allows illegal header modifications. |
| **Config Overhead** | 🚀 **Zero.** No YAML or JSON config needed. | 📝 Requires complex template/config files. |
| **Dev Loop** | ⚡ Instant hot-reloading. | 🐢 Slow warm-up times or missing hot-reload. |
| **Variable Baking** | ✅ Production-ready build step included. | ❌ Manual build scripts required. |

**CloudFrontize** is not just a runner; it's a **Linter at the Edge**, ensuring your code is valid *before* the 15-minute propagation wait.

---

## 🛠️ CLI Options & Configuration

`cloudfrontize` is designed to be a drop-in replacement for the popular [serve](https://www.npmjs.com/package/serve), we all know and love, but with "Edge Superpowers!"

| Flag | Description                                                                                                                                                                                                                                         | Default                                                                                            |
| --- |-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------|
| **`-m, --mode <mode>`** | Routing behavior. `website` (automatically serves index.html for folders), `rest` (folders return 403). Use `website` for standard S3 Website endpoints (auto-index). Use `rest` for High-Fidelity S3 REST/OAC endpoints (strict pathing, default). | `rest` |
| `--log <path>` | Path to log file for Lambda@Edge console output (Overwrites on startup)                                                                                                                                                                             | none |
| `--headers <path>` | Path to JSON file with default request headers (e.g., for Geo/Auth simulation)                                                                                                                                                                      | none |
| `-e, --edge <path>` | Path to a Lambda@Edge module or directory to simulate                                                                                                                                                                                               | none |
| `--cff <path>` | Path to a CloudFront Function file or directory to simulate                                                                                                                                                                                         | none |
| **`-E, --env <path>`**  | Path to environment file (Strict: Reserved AWS variables only)                                                                                                                                                                                      | `null`                                                                                             |
| **`-b, --bake <path>`** | Path to variables file for `__VAR__` string replacement                                                                                                                                                                                             | `null`                                                                                             |
| **`-o, --output <path>`**| Output the baked `.js` file(s) for production deployment                                                                                                                                                                                            | `null`                                                                                             |
| **`-p, --port <number>`** | Port to listen on                                                                                                                                                                                                                                   | `3000`                                                                                             |
| **`-l, --listen <uri>`** | Listen URI (overrides `--port`)                                                                                                                                                                                                                     | `3000`                                                                                             |
| **`--webui <port>`**    | Enable the visual control plane for real-time traffic inspection and header debugging                                                                                                                                                               | `disabled` |
| **`-s, --single`** | SPA mode — rewrite all 404s to `index.html`                                                                                                                                                                                                         | `off`                                                                                              |
| **`-C, --cors`** | Enable `Access-Control-Allow-Origin: *`                                                                                                                                                                                                             | `off`                                                                                              |
| **`-d, --debug`** | Show Lambda execution logs and URI rewrites                                                                                                                                                                                                         | `off`                                                                                              |
| **`-u, --no-compression`** | Disable automatic on-the-fly compression                                                                                                                                                                                                            | `off`                                                                                              |
| **`--no-etag`** | Disable ETag headers                                                                                                                                                                                                                                | `off`                                                                                              |
| **`-L, --no-request-logging`** | Mute startup logs                                                                                                                                                                                                                                   | `off`                                                                                              |
| **`--strict`** | Enforce strict CloudFront limits (40KB body, 1MB response, headers)                                                                                                                                                                                 | `off`                                                                                              |
| **`--origins <path>`** | Path to JSON file with S3/Multi-Origin configuration                                                                                                                                                                                                | none |
| **`--s3-origin <bucket>`** | Proxy requests to a real S3 bucket instead of local directory                                                                                                                                                                                     | none |
| **`--s3-endpoint <url>`** | Custom S3 endpoint (e.g. MinIO) - implies forcePathStyle                                                                                                                                                                                            | none |
| **`--allow-networking`** | Enable http/https modules in Lambda@Edge functions (disabled by default to avoid non-edge-safe patterns such as `localhost` or private services)                                                                                                    | `off` |
| **`-V, --version`** | Output the version number                                                                                                                                                                                                                           | `off`                                                                                              |

---

## 🪣 S3 & Multi-Origin Support `New!`

CloudFrontize can point to **AWS S3** or S3-compatible storage like **MinIO**, **LocalStack**, or **Cloudflare R2**. You can even simulate complex distributions with multiple origins (e.g., S3 for assets and a local API stub).

**[👉 Read the S3 & Multi-Origin Guide](docs/s3-origin.md)**

---

## 🖥️ Visual Control Plane (Web UI) `New!`

CloudFrontize includes a browser-based UI to help you visualize your edge logic in real-time. Inspect headers, track URI rewrites, and debug Lambda@Edge execution without leaving your browser.

Using the **Header Intelligence** panel, you can inject or override headers on-the-fly to test Geo-routing, Auth tokens, or Security policies without changing a single line of code.

**[👉 Learn how to use the Web UI](docs/web-ui.md)**

---


## 🚀 Lambda@Edge Integration 

Since there is no AWS Console locally, CloudFrontize uses two methods to identify the correct `hook` to simulate. Use the `--edge` flag to pass your file or directory:

### 1. Detection Methods `New!`
* **Filename Prefix:** Use a strict naming convention starting with the `hook` name (e.g., `origin-request.auth.js`).
* **Explicit Export:** Include exports.hookType = HookType in your code (e.g exports.hookType = 'origin-request') 

> **Note:** An explicit `exports.hookType` always overrides a filename prefix.  If unable to identify the hookType , CloudFrontize will default to `viewer-request`

### 2. Available Hooks
| Hook Type | Execution Timing | Common Use Case |
| :--- | :--- | :--- |
| **`viewer-request`** | Before Cache | Auth, Redirects, Bot Blocking |
| **`origin-request`** | Before Origin | URI Rewrites, Secrets Manager |
| **`origin-response`** | After Origin | Header Injection, `Cache-Control` |
| **`viewer-response`** | Before Viewer | Security Headers (HSTS, CSP) |

---
## ⚡ CloudFront Functions (CFF) `New!`

CloudFront Functions provide a lightweight, high-performance environment for high-scale transformations. Use the **`--cff`** flag to pass your file or directory:

### 1. Automatic Hook Detection
* **Filename Prefix:** Use a strict naming convention starting with the hook name (e.g., `viewer-request.security.js`).
* **Lexicographical Order:** If pointing to a directory, files are executed in alphabetical order.

> **Note:** CloudFrontize simulates the CFF environment with strict fidelity to AWS limits, including the **1ms CPU limit** and restricted module access (JavaScript ES5.1 only, no `require`, `fs`, or `path`).

### 2. Available Hooks
| Hook Type | Execution Timing | Common Use Case |
| :--- | :--- | :--- |
| **`viewer-request`** | Before Lambda@Edge `viewer-request` | URL Rewrites, Header Manipulation |
| **`viewer-response`** | After Lambda@Edge `viewer-response` | Security Headers, Cache-Control |

---
## 🛡️ Engineered for Fidelity

Don't just simulate the Edge—**master it.** CloudFrontize is built to mirror the high-stakes environment of a live AWS PoP (Point of Presence).

* **⚡ Native Async/Await Support:** Whether your middleware is a simple redirect or a complex, asynchronous database lookup, CloudFrontize handles `async` handlers and Promises with the same grace as the live Lambda@Edge runtime.
* **🧩 Multi-Hook Testing:** Pass a directory to `--edge` and CloudFrontize will automatically mount every valid Lambda it finds. Orchestrate your **Viewer Request**, **Origin Request**, and **Response** hooks in one unified local environment.
* **📦 RequestBody Access:** Use `event.Records[0].cf.request.body` to access base64 encoded payloads. We support the standard AWS buffering logic.
* **🚫 Strict Header & Body Validation:** Use `--strict` to identify "Read-only" or "Forbidden" headers for **both request and response hooks**, as well as the **40KB viewer-request body limit** and the **1MB generated response limit** in real-time. We trigger **502 Bad Gateway** errors locally for the same illegal mutations that fail in production.
* **🌐 Managed Networking:** Networking is disabled by default to prevent non-edge-safe patterns like `localhost`. While Lambda@Edge allows outbound HTTP(S) requests, they must target publicly reachable services. Use `--allow-networking` to enable network calls during local testing.
* **🎭 Mocked Context & Events:** We provide a high-fidelity `event` and `context` object, ensuring your logging, metrics, and custom error-handling tools work exactly as they would in production.

---

## 🐕 Featured Example
### The "Paws & Pixels" Secure Gallery

We’ve bundled a complete, interactive sample to show you the power of **CloudFrontize**. It protects a premium dog photography gallery using a `viewer-request` authentication gate.

### Lambda@Edge sample
Clone the GitHub repo 
```shell
git clone https://github.com/felipecarrillo100/cloudfrontize.git
```

### The Sample Logic (`lambda-edge-authorization.js`)

```javascript
'use strict';

/**
 * Lambda@Edge Example: Basic Authentication (viewer-request)
 */

// MANDATORY: Tells CloudFrontize which trigger point to simulate
exports.hookType = 'viewer-request';

exports.handler = (event, context, callback) => {
    const request = event.Records[0].cf.request;
    const headers = request.headers;

    // Credentials for demo purposes
    const user = "admin";
    const password = "password";

    const authString = "Basic " + Buffer.from(user + ":" + password).toString("base64");

    if (
        typeof headers.authorization === "undefined" ||
        headers.authorization[0].value !== authString
    ) {
        const response = {
            status: "401",
            statusDescription: "Unauthorized",
            body: "Unauthorized",
            headers: {
                "www-authenticate": [{
                    key: "WWW-Authenticate",
                    value: 'Basic realm="Protected Area"'
                }],
            },
        };

        callback(null, response);
        return;
    }

    callback(null, request);
};
```
Then run
```bash
cloudfrontize ./www -e ./samples/medium/lambda-edge-authorization.js -d -C
```
* The `www` folder contains the sample files (html, js, css, etc.)
* The `lambda-edge-authorization.js` file contains the lambda@edge logic
* The `-d` option enables debug messages while `-C` enables CORS
* Default port is 3000, you can now open your browser at http://localhost:3000/
* The username is `admin` and the password is `password`, as defined in the Lambda@Edge logic.  

### A CFF Example
Your file must start with `viewer-request` or `viewer-response` to let the simulator know the type of CFF we want to execute. In this case we have called it: `viewer-request-redirect.js`
```javascript
function handler(event) {
    var request = event.request;
    var uri = request.uri;

    // Direct response (short-circuits the pipeline)
    if (uri === '/promo') {
        return {
            statusCode: 301,
            statusDescription: 'Moved Permanently',
            headers: {
                'location': { value: '/summer-sale' }
            }
        };
    }

    return request;
}
```

Run with:
```bash
cloudfrontize ./www --cff ./samples/cff/viewer-request-redirect.js -d --mode website
```
* `-d` Enables debug, and `--mode website` takes care of appending `index.html` to folders
* Open in browser  http://localhost:3000/promo
* You will be redirected to http://localhost:3000/summer-sale
---

## 🎓 CloudFrontize Academy (Tutorial)

New to Lambda@Edge? We've built a comprehensive, hands-on tutorial to take you from **Newbie to Production Pro**.

Our **[CloudFrontize Academy](./tutorial/README.md)** includes 20+ thematic exercises covering:
* **Module 1: Foundations** (Security Headers, Redirects, Normalization)
* **Module 2: Origin Intelligence** (A/B Testing, Geo-Localization, Header Cleaning)
* **Module 3: Edge Computing** (Custom Auth, Maintenance Pages, Payload Inspection)
* **Module 4: Production Workflows** (Variable Baking & Deployment)
* **Module 5: CloudFront Functions** (CFF)

Each exercise comes with a **Business Scenario**, **Starter Template**, and **Full Solution**.

---

## 📜License

**CloudFrontize** is licensed under the **[PolyForm Noncommercial 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0/)**. For the full legal text and specific terms, please refer to the [LICENSE](https://polyformproject.org/licenses/noncommercial/1.0.0/) file in this package.

* **✅ Free for Individuals & Education:** 100% free for personal projects, open-source contributions, students, and researchers. This includes full access to the **CloudFrontize Academy**.
* **💼 Requires a Commercial License:** Use by for-profit organizations, or work performed on behalf of a for-profit entity, requires a commercial license.
* **⏳ 30-Day Business Trial:** We offer a one-month free evaluation period for professional teams. Integrate CloudFrontize into your workflow, experience the "Zero-Wait" deployment cycle, and measure your team's productivity gains before committing.


Maintaining high-fidelity AWS emulation takes significant time. If your company is saving thousands of dollars in "developer-wait-time" by using this tool, please support its continued development.

[![Sponsor](https://img.shields.io/badge/Sponsor-❤️-ff69b4?style=for-the-badge&logo=github)](https://github.com/sponsors/felipecarrillo100)
---
## ⚖️ Legal & Disclaimer

**CloudFrontize** is a local simulation tool. While it is designed to mirror AWS CloudFront and Lambda@Edge behavior as closely as possible, it is not an official AWS product.

**THE SOFTWARE IS PROVIDED "AS IS"**, WITHOUT WARRANTY OF ANY KIND. Testing on CloudFrontize does not guarantee success on live AWS infrastructure. The author is not liable for any production downtime, data loss, or financial damages resulting from the use of this tool. Always validate your logic in an AWS staging environment before a full production rollout.

---
# 🌱 Support the Project
[<img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" name="buy-me-a-coffee" alt="Buy Me A Coffee" width="180">](https://buymeacoffee.com/felipecarrillo100)

Creating and maintaining open-source libraries is a passion of mine. If you find this `cloudfrontize` useful and it saves you time, please consider supporting its development. Your contributions help keep the project active and motivated!

Every bit of support—whether it's sponsoring on GitHub, a coffee, a star, or a shout-out, is deeply appreciated. Thank you for being part of the community!

### 🏢 Corporate & Business Use
Does your team use CloudFrontize to speed up production workflows?
Please support the project by selecting the **Corporate Tier** on [GitHub Sponsors](https://github.com/sponsors/felipecarrillo100).
* **Standard Business License:** $25/month per team (for up to 5 users).
* **Enterprise:** Contact me for a one-time perpetual site license.

