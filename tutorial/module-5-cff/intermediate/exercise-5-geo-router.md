# Exercise 2.1: The Geo Router (URI Rewrite Edition)

## 🎭 The Scenario

Your marketing team wants to **serve localized content** without changing the URL in the user's browser. They've requested that visitors from **France (`FR`)** see the French version of the site, while everyone else sees the default version.

Instead of a bulky 302 redirect—which forces the browser to make a second request—you will perform an **internal URI rewrite** at the edge.

CloudFront Functions can intercept the request and "swap" the file path behind the scenes. The user stays on `example.com/`, but CloudFront fetches `/countries/FR/index.html`.

---

## 🎯 Your Goal

Implement a **CloudFront Function** that:

* Reads the `CloudFront-Viewer-Country` header.
* If the country is **`FR`**, rewrites the URI to include the country path (e.g., `/index.html` becomes `/countries/FR/index.html`).
* **Protects Assets:** Ensures that CSS, JS, and images are **not** rewritten so they don't 404.
* Otherwise, allows the request to continue to the default origin path.

---

## 📝 Starter Code Template

```javascript
function handler(event) {
    var request = event.request;
    var headers = request.headers;
    var uri = request.uri;

    // TODO:
    // 1. Get the country from headers (default to 'US')
    // 2. Check if the request is for a "Page" (root or .html)
    // 3. If country is 'FR' and it's a page, rewrite the URI
    //    to: '/countries/FR' + uri

    return request;
}

```

---

## 🛠 Instructions

1. Create the exercise file:

```bash
tutorial/module-5-cff/intermediate/viewer-request-geo-router.js

```

2. Implement the **internal rewrite** logic. Be careful to only rewrite HTML/Root requests!
3. Start the CloudFrontize emulator:

```bash
# Ensure your www folder has a /countries/FR/ directory!
cloudfrontize www --cff ./tutorial/module-5-cff/intermediate/viewer-request-geo-router.js --debug

```

---

## 🧪 How to Test

### 1. Simulating the French Viewer

Use the `--headers` flag to inject the country code into the emulator:

```bash
cloudfrontize www --cff ./tutorial-cff/intermediate/viewer-request-geo-router.js --headers ./tutorial-cff/intermediate/exercise-5-geo-router.json --debug --mode website
```

### 2. Verification with `curl`

**Test the Rewrite (The Page):**

```bash
curl -v -H "cloudfront-viewer-country: FR" http://localhost:3000/index.html
```

* **Result:** You should see the content of `/countries/FR/index.html`.
* **Terminal:** Check your logs; you should see the URI modification (REWRITE:).
```text
REWRITE: /index.html -> /countries/FR/index.html
[Debug] Mode: website, isRestMode: false, URL: /countries/FR/index.html, FullPath: D:\antigravity\cloudfrontize\www\countries\FR\index.html
```

**Test Asset Protection (The CSS):**

```bash
curl -v -H "cloudfront-viewer-country: FR" http://localhost:3000/style.css
```

* **Result:** You should see your standard CSS without redirect. If the logic is wrong, this would incorrectly try to fetch `/countries/FR/style.css` and return a 404.

---

## 💡 Fidelity Tip: Rewrite vs. Redirect

| Feature | Redirect (302) | Rewrite (Internal) |
| --- | --- | --- |
| **Browser URL** | Changes to `/fr` | Stays at `/` |
| **Performance** | Extra round-trip for browser | Instant internal swap |
| **SEO** | Good for separate localized URLs | Good for "one URL, many regions" |
| **Complexity** | Simple | Requires "Asset Protection" logic |

> **Warning:** Always check the file extension before rewriting. If you rewrite your `.js` or `.png` files into a country subfolder, your site's layout will break!

---

## 🎓 Learning More

**AWS Documentation**
[CloudFront Function Event Structure](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/functions-event-structure.html)

**Keywords**
`URI Rewriting`, `Edge Localization`, `CloudFront-Viewer-Country`, `Asset Protection`

---

[⬅️ Back to Syllabus](../README.md)
