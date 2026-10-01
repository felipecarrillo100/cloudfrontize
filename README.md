# cloudfrontize

[![Sponsor](https://img.shields.io/badge/Sponsor-❤️-ff69b4?style=for-the-badge&logo=github)](https://github.com/sponsors/felipecarrillo100)
![npm](https://img.shields.io/npm/v/cloudfrontize)
![node](https://img.shields.io/node/v/cloudfrontize)

📜 **Changelog:** See [CHANGELOG.md](CHANGELOG.md) for release history.

---

#### A local CloudFront workbench for Lambda@Edge and CloudFront Functions.

Build a distribution, write its functions and test them locally, with CloudFront's rules, in milliseconds instead of waiting 15 minutes for each deployment.

| CloudFrontize Console                                                                                                    | CloudFrontize Web UI |
|--------------------------------------------------------------------------------------------------------------------------|--------------------|
| ![Cloudfrontize Banner](https://raw.githubusercontent.com/felipecarrillo100/cloudfrontize/main/assets/cloudfrontize.png) | ![CloudFrontize Pro Dashboard](https://raw.githubusercontent.com/felipecarrillo100/cloudfrontize/main/assets/cloudfrontize-pro-ui.png) |

---
## 📦 Getting started

CloudFrontize needs **Node.js 22** or later.

```bash
npm install -g cloudfrontize
cloudfrontize init my-site --template spa     # a project from a starter template
cd my-site
cloudfrontize --webui                          # the site on :3000, the workbench on :3001
```

Or without installing: `npx --yes cloudfrontize init my-site`.

Open [http://localhost:3001](http://localhost:3001): the **workbench** shows the distribution, its functions and every request going through them. Edit a function there (or in your own editor) and the change is live when you save.

> Already using CloudFrontize 2.x? Your command lines still work. `cloudfrontize import` turns one into a project: see the **[migration guide](docs/migrating-to-3.md)**.

---

## 🗂️ Projects

A project is a folder with a `cloudfrontize.json`. It describes the distribution the way CloudFront does: origins, cache behaviors, and which function runs on which event. Everything else is ordinary files:

```
my-site/
├── cloudfrontize.json                                   the distribution
├── functions/
│   ├── cloudfront/viewer-request.spa-router.js          CloudFront Functions
│   └── lambda-edge/origin-response.cache-headers.js     Lambda@Edge
├── origins/www/                                         a local origin's content
├── kvs/redirects.json                                   key value stores (AWS import format)
├── config/headers.json                                  the viewer simulation (location, device…)
└── checks.json                                          requests and the responses they must get
```

```json
{
  "$schema": "https://raw.githubusercontent.com/felipecarrillo100/cloudfrontize/main/schema/cloudfrontize.schema.json",
  "version": 1,
  "name": "my-site",
  "distribution": { "strict": true },
  "origins": [
    { "id": "website", "type": "local", "path": "origins/www" },
    { "id": "media", "type": "s3", "bucket": "my-media", "region": "eu-west-1", "credentials": { "profile": "dev" } }
  ],
  "functions": {
    "spa-router": { "type": "cloudfront-function", "runtime": "cloudfront-js-2.0", "file": "functions/cloudfront/viewer-request.spa-router.js" },
    "cache-headers": { "type": "lambda-edge", "runtime": "nodejs22.x", "file": "functions/lambda-edge/origin-response.cache-headers.js" }
  },
  "behaviors": [
    { "pathPattern": "/media/*", "origin": "media", "functions": { "origin-response": "cache-headers" } }
  ],
  "defaultBehavior": { "origin": "website", "functions": { "viewer-request": "spa-router" } }
}
```

- The `$schema` line gives your editor autocompletion and validation.
- CloudFrontize checks every AWS rule it knows when the project loads: one function per event, CloudFront Functions only on viewer events, no CloudFront Functions and Lambda@Edge on the same behavior's viewer events, the 10 KB CloudFront Functions limit, key value store limits…
- AWS keys never go in a project: S3 origins use an AWS profile or the environment.
- Commit the folder: it runs the same way for everyone, in the workbench or headless.

---

## 🧰 Commands

| Command | What it does |
|---|---|
| `cloudfrontize [project] [--webui]` | Serves a project (default: the current folder). `--webui [port]` adds the workbench (default port: main port + 1). |
| `cloudfrontize init [dir] --template <id>` | Creates a project from a starter template. |
| `cloudfrontize templates` | Lists the templates. |
| `cloudfrontize validate [project]` | Checks the project against AWS rules; exits non-zero on errors. |
| `cloudfrontize check [project]` | Serves the project and runs its `checks.json`; exits non-zero on failures. Made for CI. |
| `cloudfrontize build [project] --out dist --level minified --bake config/production.env` | Writes deployable code: `__VAR__` values baked in, optionally minified, checked as AWS will see it (10 KB limit included), with a `build.json` describing where each function is attached. |
| `cloudfrontize import [dir] --edge … --out my-project` | Turns a 2.x command line into a project. |

Options that override a project's settings for one run: `--port`, `--host` (e.g. `127.0.0.1` to keep the server off your network), `--strict`, `--cors`, `--single`, `--no-compression`, `--no-etag`, `-L`, `--debug`, `--log`.

---

## 🖥️ The workbench

`--webui` opens CloudFrontize in your browser:

- **Start screen**: new project (from a template), open a project, recent projects.
- **Schematic**: Viewer → Distribution → Origin, with each cache behavior's four event slots where CloudFront runs them. A slot only offers the functions AWS allows there, and says why the others aren't allowed.
- **Inspectors**: the viewer simulation (location and device presets, test requests), distribution settings and behaviors, origins (with *Test connection*), and each function's build state, runtime and size.
- **Editor**: function code, key value stores and `cloudfrontize.json`, with CloudFront's event types, build errors as you save, and a diff when a file changed on disk meanwhile.
- **Traffic**: every request's journey step by step, with what each function changed in the headers and body.

> **CloudFront-added headers follow AWS.** Simulated geolocation, device and other headers CloudFront adds (`CloudFront-Viewer-Country`, `CloudFront-Is-Mobile-Viewer`, …) are visible where AWS exposes them: to CloudFront Functions, and to Lambda@Edge only in **origin-request** and **origin-response** (*"CloudFront adds the headers after the viewer request event"*). A value CloudFront adds overwrites one the viewer sent for origin-facing functions, while viewer-facing functions see the viewer's own value. Functions on response events can read the query string but can't change it.

**[👉 The workbench guide](docs/web-ui.md)**

---

## 🧩 Templates

| Template | What it does |
|---|---|
| `empty` | One origin and a starter page |
| `spa` | Single-page app: routes without a file extension get `index.html` (CloudFront Function) |
| `security-headers` | HSTS, CSP and the other recommended security headers (CloudFront Function) |
| `basic-auth` | Password-protects `/admin/*` through a cache behavior (CloudFront Function) |
| `redirects` | Redirects driven by a CloudFront KeyValueStore |
| `geo-routing` | Each country gets its language's site (Lambda@Edge, origin-request) |
| `ab-testing` | Cookie-based A/B test of the home page (CloudFront Function) |
| `s3-origin` | The site from an S3 bucket: MinIO in Docker locally |
| `dynamodb-auth` | Members area checked against DynamoDB on LocalStack (Lambda@Edge) |

Each one is a working project with a README, and its own `checks.json`.

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

* **Start in seconds:** `cloudfrontize init` creates a working project from a template; the 2.x style (`cloudfrontize ./www --edge hook.js`, like Vercel's [serve](https://www.npmjs.com/package/serve)) still works.
* **Real-Time Hot Reloading:** Tweak your URI rewrites or security headers and see the results instantly on browser refresh. No packaging, no uploading, no waiting for the "In Progress" spinner.
* **Debug directly to the console:** Stop hunting for logs in hidden CloudWatch streams across random regions. See your console.log outputs and execution errors live **in your terminal**. 
* **Production Fidelity:** Emulates in detail CloudFront-specific features & quirks, like the **10MB auto-compression limit**, header blacklisting, and URI normalization.
* **RequestBody Support:** Access the request payload in your hooks for webhook validation or body-based routing.
* **The "Safety Net":** Catch forbidden header mutations or invalid response structures locally. Use `--strict` to auto-fail requests that break AWS's rules: disallowed and read-only headers, generated-response and replaced-body sizes, the 10 KB CloudFront Function size, and invalid function combinations. Timing limits only warn, because your machine isn't AWS's hardware.

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


> 💡 All of these are covered step-by-step in the **[CloudFrontize Academy](./tutorial/v3/README.md)**, and most are a [template](#-templates) away.

---

## ⚖️ Value Proposition & Market Comparison

While tools like `serverless-offline` or `SAM CLI` are great for standard Lambda functions, they often fall short when it comes to the specific, high-stakes constraints of the **AWS Edge**.

| Feature | CloudFrontize | Other Local Simulators |
| --- | --- | --- |
| **Edge Fidelity** | 🎯 Built specifically for the 4 CloudFront triggers. | ⚠️ Usually limited to generic API Gateway events. |
| **Limits Enforcement** | ✅ Enforces 40KB body & 1MB response limits. | ❌ Generally ignores Edge-specific size limits. |
| **Header Validation** | ✅ Warns/Fails on forbidden header mutations. | ❌ Allows illegal header modifications. |
| **Config Overhead** | 🚀 One JSON file, autocompleted and checked against AWS rules (or none, with 2.x flags). | 📝 Requires complex template/config files. |
| **Dev Loop** | ⚡ Instant hot-reloading. | 🐢 Slow warm-up times or missing hot-reload. |
| **Variable Baking** | ✅ `cloudfrontize build`: baked, minified, checked as AWS will see it. | ❌ Manual build scripts required. |

**CloudFrontize** is not just a runner; it's a **Linter at the Edge**, ensuring your code is valid *before* the 15-minute propagation wait.

---

## 🛡️ Engineered for Fidelity

Don't just simulate the Edge—**master it.** CloudFrontize is built to mirror the high-stakes environment of a live AWS PoP (Point of Presence).

* **⚡ Native Async/Await Support:** Whether your middleware is a simple redirect or a complex, asynchronous database lookup, CloudFrontize handles `async` handlers and Promises with the same grace as the live Lambda@Edge runtime.
* **🧩 Per-behavior functions:** Each cache behavior runs its own functions on its four events, matched on the viewer's path as CloudFront does (`*` and `?` wildcards, first match wins). A URI rewrite doesn't change the behavior or the origin, as in AWS.
* **📦 RequestBody Access:** Use `event.Records[0].cf.request.body` to access base64 encoded payloads. We support the standard AWS buffering logic.
* **🚫 Strict Header & Body Validation:** Use `--strict` to enforce AWS's documented rules for **both CloudFront Functions and Lambda@Edge**: disallowed headers (hidden from functions and never addable) and per-event read-only headers, generated responses (**40 KB** on viewer events, **1 MB** on origin events), replaced request bodies, the **10 KB** CloudFront Function size, and the rule that CloudFront Functions and Lambda@Edge can't share viewer events. Violations return **502** (`LambdaValidationError` / `FunctionValidationError`), and a function that throws returns **503** (`LambdaExecutionError` / `FunctionExecutionError`), just as in production. Timing limits (Lambda@Edge's **30 s**) only **warn**, in every mode, because local hardware isn't AWS hardware. Only runaway code is stopped: a Lambda@Edge handler still running after 60 s, or a CloudFront Function after 1 s, gets a 503.
* **🌐 Lambda's real environment:** As in AWS, Lambda@Edge functions can use any module, the network and the file system in every event. CloudFrontize simulates Lambda's limits: the file system is read-only except `/tmp` (mapped to a per-project sandbox folder, so writes elsewhere fail with `EROFS`), reading files outside the project warns (they wouldn't be in the deployment package), connecting to localhost or a private network warns (AWS can't reach your machine), and only reserved environment variables (plus your `.env`) are visible, never the host's.
* **🎭 Mocked Context & Events:** We provide a high-fidelity `event` and `context` object, ensuring your logging, metrics, and custom error-handling tools work exactly as they would in production.


### The four events

| Event | Runs | CloudFront Functions | Lambda@Edge | Typical use |
| :--- | :--- | :---: | :---: | :--- |
| **viewer-request** | Every request, before the cache | ✅ | ✅ | Auth, redirects, URL rewrites, cache key normalization |
| **origin-request** | Cache misses, before the origin | | ✅ | Routing, rewrites, calls to AWS services |
| **origin-response** | Cache misses, after the origin | | ✅ | Cleaning headers, `Cache-Control` |
| **viewer-response** | Every response; not when the origin returns 400+ | ✅ | ✅ | Security headers |

CloudFrontize runs both CloudFront Functions runtimes with AWS's limits. **Runtime 1.0** is JavaScript ES 5.1; **runtime 2.0** adds `const`/`let`, arrow functions, template literals, `async`/`await`, the `crypto`, `querystring` and `buffer` modules, and **CloudFront KeyValueStore** (`import cf from 'cloudfront'`). In both, functions have no network, file system, environment variables or timers, `Date` stays at the function's start time, and the 1 ms compute limit is reported as a warning.

---

## 🪣 S3 & Multi-Origin

Origins can be local folders or **S3 buckets**: AWS S3, or S3-compatible storage like **MinIO**, **LocalStack** or **Cloudflare R2** (`endpoint` and `forcePathStyle`), in REST (Origin Access Control) or website-hosting mode. Cache behaviors route paths to different origins.

**[👉 The S3 & Multi-Origin Guide](docs/s3-origin.md)** · `cloudfrontize init my-site --template s3-origin`

---

## ⌨️ The 2.x command line

CloudFrontize 2.x commands keep working in 3.0: point it at a folder and your function files, like [serve](https://www.npmjs.com/package/serve) with edge superpowers. Functions run on every path, and the command prints the `cloudfrontize import` line that turns the setup into a project.

```bash
cloudfrontize ./www --edge ./viewer-request-rewrite.js --debug
```

Since there is no manifest, CloudFrontize finds each function's event from `exports.hookType = 'origin-request'` in the code, or from a file name starting with the event (`origin-request.auth.js`); otherwise it assumes `viewer-response`. A folder passed to `--edge` or `--cff` loads every `.js` file in it, in alphabetical order.

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
| **`--host <address>`** | Address to listen on (default: all interfaces; `127.0.0.1` keeps it on this machine) | all |
| **`-l, --listen <uri>`** | Listen URI (overrides `--port`)                                                                                                                                                                                                                     | `3000`                                                                                             |
| **`--webui [port]`**    | Open the workbench in your browser (listens on this machine only; port defaults to the main port + 1)                                                                                                       | `disabled` |
| **`-s, --single`** | SPA mode — serve `index.html` (status 200) when the origin returns 404 or 403                                                                                                                                                                       | `off`                                                                                              |
| **`-C, --cors`** | Enable `Access-Control-Allow-Origin: *` and answer CORS preflight requests                                                                                                                                                                          | `off`                                                                                              |
| **`-d, --debug`** | Show Lambda execution logs and URI rewrites                                                                                                                                                                                                         | `off`                                                                                              |
| **`-u, --no-compression`** | Disable automatic on-the-fly compression                                                                                                                                                                                                            | `off`                                                                                              |
| **`--no-etag`** | Disable ETag headers (local origins send `ETag` and `Last-Modified` by default)                                                                                                                                                                     | `off`                                                                                              |
| **`-L, --no-request-logging`** | Disable per-request access logs                                                                                                                                                                                                                     | `off`                                                                                              |
| **`--strict`** | Fail requests that break AWS rules (headers, sizes, function combinations); timing only warns                                                                                                                                                       | `off`                                                                                              |
| **`--origins <path>`** | Path to JSON file with S3/Multi-Origin configuration                                                                                                                                                                                                | none |
| **`--s3-origin <bucket>`** | Proxy requests to a real S3 bucket instead of local directory                                                                                                                                                                                     | none |
| **`--s3-endpoint <url>`** | Custom S3 endpoint (e.g. MinIO) - implies forcePathStyle                                                                                                                                                                                            | none |
| **`--allow-networking`** | *Deprecated, no effect.* Lambda@Edge functions have network access in every event, as in AWS; connecting to localhost or a private address prints a fidelity warning | — |
| **`-V, --version`** | Output the version number                                                                                                                                                                                                                           | `off`                                                                                              |


### Example: the "Paws & Pixels" Secure Gallery

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

New to Lambda@Edge and CloudFront Functions? The **[CloudFrontize Academy](./tutorial/v3/README.md)** takes you from your first function to production builds. Each tutorial is a project you open in the workbench, with a business scenario, the lesson, starter code, the solution, and checks that tell you it works:

* **Intro**: run, inspect and debug
* **Module 1: Foundations**: security headers, query normalization, device redirects
* **Module 2: Origin Intelligence**: A/B testing, geo-localization, header cleaning
* **Module 3: Edge Computing**: authentication, maintenance pages, payload inspection
* **Module 4: Production**: configuration per environment, baking, `cloudfrontize build`
* **Module 5: CloudFront Functions**: runtime 2.0 and KeyValueStore

The [2.x versions](./tutorial/README.md) remain for command-line setups.

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

