# Intro: Run & Debug

Testing an edge function in AWS means deploying it and waiting for CloudFront to replicate it, then reading CloudWatch logs in several regions. CloudFrontize runs the same function on your machine, with CloudFront's rules, and shows you every step of every request. This first tour takes about ten minutes, and needs no code.

## 🧩 The Project

This folder is a CloudFrontize **project**: a `cloudfrontize.json` that describes the distribution, plus the files it uses.

```
00-intro/
├── cloudfrontize.json                        the distribution: one origin, one function
├── functions/lambda-edge/origin-request.geo.js
├── origins/www/index.html                    the main site
├── origins/www/index-fr.html                 the French page
└── checks.json                               what this project must do
```

The function sends visitors from France to the French page, without changing the URL:

```javascript
exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    const header = request.headers['cloudfront-viewer-country'];
    const country = header ? header[0].value : 'US';
    if (country === 'FR' && (request.uri === '/' || request.uri === '/index.html')) {
        request.uri = '/index-fr.html';
    }
    return request;
};
```

`CloudFront-Viewer-Country` is a header **CloudFront adds** with the viewer's country. It adds it *after* the viewer request event, so a Lambda@Edge function reads it on **origin-request**, where this one runs.

## ▶️ Step 1: Run it

From this folder:

```bash
cloudfrontize --webui
```

- The site: [http://localhost:3000](http://localhost:3000) shows the **main site**.
- The workbench: [http://localhost:3001](http://localhost:3001).

The terminal shows each request, and what the function logs: `Viewer country: US`.

## 🗺️ Step 2: The schematic

The top of the workbench draws the distribution the way CloudFront runs it: **Viewer → Distribution → Origin** on the request lane, back along the response lane. The four event slots sit where CloudFront runs them; this project has `geo` on **origin-request**.

Click **geo** to inspect it (its build state, runtime and where it runs). Double-click it to open its code.

## 🇫🇷 Step 3: Visit from France

1. Click **Viewer**. Its inspector simulates what CloudFront knows about visitors.
2. Under **Presets**, choose **Location → FR · Paris**, then **Save**. (It's saved to `config/headers.json` in the project.)
3. Refresh [http://localhost:3000](http://localhost:3000): the **French page**, at the same URL.

Notice the *CloudFront adds this* label: those headers follow AWS's rules, for example a Lambda@Edge **viewer**-request function wouldn't see them.

## 🔍 Step 4: Follow the request

At the bottom, **Traffic** lists every request. Select the last one: its journey shows each step (the viewer's request, the **origin-request** function, the request to the origin, the response). Select the **origin-request** step: the URI changed to `/index-fr.html`, and the header table shows what the function saw.

You can also send requests from the **Viewer** inspector's *Test request*, with any headers.

## ✏️ Step 5: Change the code

Open `geo` in the editor (double-click it) and add Germany:

```javascript
if (country === 'DE') request.uri = '/index-de.html';
```

Press **Ctrl+S** (⌘S): CloudFrontize rebuilds the function at once and shows problems next to the code. (You'd also need an `index-de.html` in `origins/www`.) Prefer your own editor? Edit the file in VS Code; CloudFrontize reloads it when you save.

## ✅ Step 6: Check it

```bash
cloudfrontize validate     # the project follows CloudFront's rules
cloudfrontize check        # the requests in checks.json get the responses they should
cloudfrontize build        # the code to deploy, in dist/
```

## 🧠 What you learned

* A project is a folder with `cloudfrontize.json`: origins, behaviors and which function runs on which event.
* The workbench shows the distribution, simulates viewers, and traces every request step by step.
* CloudFront's own headers (location, device) are visible where AWS makes them visible.
* `validate`, `check` and `build` work from the command line too, for CI.

Next: [1.1 The Security Guard](../01-foundations/1.1-security-guard/README.md), or start your own project with `cloudfrontize init my-site --template spa` (`cloudfrontize templates` lists them).
