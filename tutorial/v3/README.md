# Tutorials for CloudFrontize 3

Each tutorial here is a small **CloudFrontize project**: open it in the WebUI or run it from the command line, read the article, and change the code. Every tutorial is also checked automatically, so they stay correct as CloudFrontize evolves.

The original modules in the parent folder use the 2.x command-line style (`cloudfrontize www --edge …`). They keep working, and will be converted here one by one.

| Tutorial | What it shows |
|---|---|
| [1.1 The Security Guard](01-foundations/1.1-security-guard/README.md) | Adding security headers in a Lambda@Edge viewer-response function |

## Run a tutorial
```bash
cd tutorial/v3/01-foundations/1.1-security-guard
cloudfrontize validate       # checks the project against AWS rules
cloudfrontize --webui        # serves it on :3000, WebUI on :3001
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
