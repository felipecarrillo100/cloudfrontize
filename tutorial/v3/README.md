# Tutorials for CloudFrontize 3

Each tutorial here is a small **CloudFrontize project**: open it in the WebUI or run it from the command line, read the article, and change the code. Every tutorial is also checked automatically, so they stay correct as CloudFrontize evolves.

The original modules in the parent folder use the 2.x command-line style (`cloudfrontize www --edge …`). They keep working; the ones converted here say so at the top.

| Tutorial | What it shows |
|---|---|
| [Intro: Run & Debug](00-intro/README.md) | A tour: the schematic, the viewer simulation, a request's journey, the editor, `check` and `build` |
| **Module 1: Foundations** | |
| [1.1 The Security Guard](01-foundations/1.1-security-guard/README.md) | Adding security headers in a Lambda@Edge viewer-response function |
| [1.2 The Librarian](01-foundations/1.2-librarian/README.md) | Sorting query strings so the cache isn't fragmented |
| [1.3 The Concierge](01-foundations/1.3-concierge/README.md) | Redirecting phones with a CloudFront Function, which can read CloudFront's device headers |
| **Module 2: Origin intelligence** | |
| [2.1 The Scientist](02-origin/2.1-scientist/README.md) | A/B testing with an internal rewrite on origin-request |
| [2.2 The Diplomat](02-origin/2.2-diplomat/README.md) | Serving each country its own site from a Lambda@Edge origin-request function |
| [2.3 The Cloaker](02-origin/2.3-cloaker/README.md) | Removing version-revealing headers before CloudFront caches them |
| **Module 3: Edge computing** | |
| [3.1 The Bouncer](03-edge/3.1-bouncer/README.md) | Basic Auth on `/admin/*` only, with a cache behavior and a short-circuit response |
| [3.2 The Architect](03-edge/3.2-architect/README.md) | A maintenance page generated at the edge |
| [3.3 The Inspector](03-edge/3.3-inspector/README.md) | Blocking malicious request bodies |
| **Module 4: Production** | |
| [4.1 The Baker](04-production/4.1-baker/README.md) | Configuration per environment without environment variables: baking, and `cloudfrontize build` |
| **Module 5: CloudFront Functions** | |
| [1.4 The Query Normalizer](05-cff/1.4-query-normalizer/README.md) | Removing tracking parameters with a CloudFront Function on runtime 2.0 |
| [1.12 The Redirect Map](05-cff/1.12-redirect-map/README.md) | Redirects driven by a CloudFront KeyValueStore |

## Run a tutorial
```bash
cd tutorial/v3/01-foundations/1.1-security-guard
cloudfrontize validate       # checks the project against AWS rules
cloudfrontize --webui        # serves it on :3000, the workbench on :3001
cloudfrontize check          # runs its checks.json
```

## Check every tutorial
```bash
npm run tutorials
```
This validates each project, starts it, and runs its `checks.json`. It also runs the 2.x tutorial suites.

## Add a tutorial
Create a folder `tutorial/v3/<NN-module>/<exercise>/`:

```
README.md            the article: scenario, lesson, goal, how to run and test it
cloudfrontize.json   the project (origins, functions, which event each one runs on)
functions/…          the solution code
origins/www/…        the website it serves
checks.json          what the tutorial must do
```

`checks.json` lists requests and what their responses must contain:

```json
{
  "$schema": "https://raw.githubusercontent.com/felipecarrillo100/cloudfrontize/main/schema/checks.schema.json",
  "checks": [
    {
      "name": "adds HSTS to the page",
      "request": { "method": "GET", "path": "/", "headers": { "user-agent": "curl" } },
      "expect": {
        "status": 200,
        "headers": { "strict-transport-security": "max-age=63072000; includeSubDomains; preload" },
        "headersContain": { "content-type": "text/html" },
        "headersAbsent": ["server"],
        "bodyContains": "Paws",
        "bodyNotContains": ["error"]
      }
    }
  ]
}
```

Header names are matched case-insensitively. Nothing else is needed: the runner finds every `checks.json` under this folder.

Keep tutorials faithful to AWS: if CloudFront wouldn't allow something (for example a header Lambda@Edge can't see in viewer-request), the tutorial shouldn't rely on it, and the article should explain why.
