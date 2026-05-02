# Exercise 2.1: The Geo Router (URI Rewrite Edition)

## 🎭 The Scenario

Your marketing team wants to **serve localized content** without changing the URL in the user's browser. They've requested that visitors from **France (`FR`)** see the French version of the site, while everyone else sees the default version.

Instead of a bulky 302 redirect—which forces the browser to make a second request—you will perform an **internal URI rewrite** at the edge.

CloudFront Functions can intercept the request and "swap" the file path behind the scenes. The user stays on `example.com/`, but CloudFront fetches `/countries/FR/index.html`.

---

## 📖 The Lesson: The Viewer Identity

When a request hits an edge location, CloudFront automatically attaches a wealth of information about the user (the "Viewer") before passing the event to your function.

### The `viewer` Object
In CFF, you have access to `event.viewer.ip`, which is the client's public IP address. However, for geographic routing, CloudFront also provides **special geolocation headers**:
- `CloudFront-Viewer-Country`: ISO country code (e.g., `US`, `FR`, `JP`).
- `CloudFront-Viewer-City`: The city name.
- `CloudFront-Viewer-Latitude` / `Longitude`: Coordinates.

### Internal URI Rewriting
A "Rewrite" is different from a "Redirect." A rewrite happens **internally** on the CloudFront servers. The user's browser never sees the change in the URL bar, but CloudFront fetches a different file from the origin. This is the ultimate "Invisible" localization technique.

---

## 🎯 Your Goal

Implement a **CloudFront Function** that performs a forensic **Internal Pivot**:

1.  **Extract**: Read the `CloudFront-Viewer-Country` header (default to `US`).
2.  **Idempotency**: Check if the URI is already localized to prevent "double-rewriting".
3.  **Pivot**: Internally prefix the URI with `/countries/{{COUNTRY}}/`.

> [!IMPORTANT]
> ### 🛑 The CFF Contract: ES5.1 Syntax Only
> CloudFront Functions execute in a specialized V8 sandbox that only supports **ECMAScript 5.1**. 
> 1. **No `const` or `let`**: You must use `var` for all variable declarations.
> 2. **String Methods**: Use `.indexOf()` or `.substr()` instead of modern ES6 methods like `.startsWith()` or `.includes()`.
> 3. **Idempotency**: Always verify the URI doesn't already start with your prefix to avoid infinite loops.

---

## 📝 Starter Code Template

```javascript
function handler(event) {
    var request = event.request;
    var headers = request.headers;
    var uri = request.uri;

    // TODO:
    // 1. Get the country from headers (default to 'US')
    // 2. IDEMPOTENCY: Don't rewrite if URI already starts with '/countries/'
    // 3. THE PIVOT: Rewrite the URI to: '/countries/' + country + uri

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

### 1. The Execution Journey (Visual Control Plane)
The browser's address bar always stays at `/`. You must use the **WebUI** to verify the internal swap:

1.  Open the **WebUI**: `http://localhost:3001`
2.  Trigger a request for the French audience:
    `curl -H "cloudfront-viewer-country: FR" http://localhost:3000/index.html`
3.  In the **Real-time Edge Traffic** list, click the request row to expand the **Execution Journey**.
4.  In the journey tree, click the **[CFF: viewer-request]** station.
5.  In the **State Inspector** panel, verify that the **Header Snapshots** (and URI state) show the pivot to `/countries/FR/index.html`.

### 2. Verification with `curl` (Content Check)
Verify that the correct content is returned while the path remains unchanged:

**Test the Rewrite (The Page):**
`curl -v -H "cloudfront-viewer-country: FR" http://localhost:3000/index.html`
*   **Result**: You should see the content of the French index page.
*   **Terminal Logs**: Look for `REWRITE: /index.html -> /countries/FR/index.html`.

**Test Asset Protection (The CSS):**
`curl -v -H "cloudfront-viewer-country: FR" http://localhost:3000/style.css`
*   **Result**: You should see your standard CSS. If the logic is wrong, the logs will show an incorrect rewrite to `/countries/FR/style.css`.

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

> [!CAUTION]
> ### 🛑 Forensic Troubleshooting: Port 3000 Hangups
> If the emulator fails to start because "Port 3000 is already in use," it means a previous session didn't close properly. 
> 1. Run: `netstat -ano | findstr :3000` to find the PID.
> 2. Run: `taskkill /F /PID <PID_NUMBER>` to clear the ghost process.

---

[⬅️ Back to Syllabus](../README.md)
