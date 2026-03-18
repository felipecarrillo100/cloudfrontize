# 🧪 Intro – Run & Debug

Welcome to your first hands-on exercise! In this introduction, you’ll learn how to:

* Run **CloudFrontize** locally
* Understand the project structure
* Debug using the **console (CLI)**
* Visualize requests in the **Web UI (Visual Control Plane)**
* Simulate **geo-based routing** using header overrides

> 💡 In this exercise, everything is provided for you—no coding required. Just run, observe, and understand.

---

## 🧩 The Ingredients

This exercise comes with everything you need:

```
intro/
├── www/
│   ├── index.html
│   └── index-fr.html
└── viewer-request-geo.js
```

### 📂 `www/` – Static Site

* `index.html` → Default page (US users)
* `index-fr.html` → French version

---

### ⚡ `viewer-request-geo.js` – Lambda@Edge Logic

This function rewrites requests based on the viewer’s country:

```javascript
exports.hookType = 'viewer-request';

exports.handler = (event, context, callback) => {
    const request = event.Records[0].cf.request;
    const headers = request.headers;

    const country = headers['cloudfront-viewer-country']?.[0]?.value || 'US';

    console.log("Viewer country:", country);

    if (country === 'FR') {
        console.log("Rewriting to French page");
        request.uri = '/index-fr.html';
    } else {
        console.log("Serving default page");
    }

    callback(null, request);
};
```

---

## ▶️ Step 1 – Run CloudFrontize

Start the emulator with debug mode and Web UI enabled:

```bash
cloudfrontize www --edge ./viewer-request-geo.js -d --webui 3001
```

You should see:

* 🛠️ Developer UI → [http://localhost:3001](http://localhost:3001)
* ☁️ Server → [http://localhost:3000](http://localhost:3000)

---

## 🌐 Step 2 – Open the "test-site" in the Browser

Go to:

👉 [http://localhost:3000](http://localhost:3000)

You’ll see the **default page (`index.html`)**, because the country defaults to `US`.

---

## 🖥️ Step 3 – Inspect the Console

Check your terminal. You should see logs like:

```text
[viewer-request] Viewer country: US
[viewer-request] Serving default page
```

👉 This is your **Lambda@Edge function running locally**.

---

## 🔁 Step 4 – Trigger a Rewrite

Now let’s simulate a user from France.

### Open the Web UI:

👉 [http://localhost:3001](http://localhost:3001)

---

| Visual Control Plane (Web UI)                                                                                                            |
|------------------------------------------------------------------------------------------------------------------------------------------|
| ![CloudFrontize Web UI](https://raw.githubusercontent.com/felipecarrillo100/cloudfrontize/main/assets/cloudfrontize-webui-intro.jpg?v=1) |

---

### In the Web UI:

1. Locate the **Header Intelligence panel**
2. Add or modify the header:
    ```
    CloudFront-Viewer-Country: FR
    ```
    >💡 **Tip:** You can do this more easily by clicking the preset button: `France (FR)`
    
    **IMPORTANT:** Click the `Save Changes` button to apply your header.

3. Trigger a new request by refreshing the **test-site** in your browser:

   👉 [http://localhost:3000](http://localhost:3000)
---

## 🇫🇷 Step 5 – Observe the Result

Now the behavior changes:

### 🌐 Browser

* You’ll see the **French page (`index-fr.html`)** even when your requested `/`

### 🖥️ Console

```text
[viewer-request] Viewer country: FR
[viewer-request] Rewriting to French page
```

### 🔍 Web UI

* You’ll see the **request flow**
* The **URI rewrite** from `/` → `/index-fr.html`
* Updated headers in real time

---

## 🇫🇷 Step 6 – Experiment and Verify

To test the routing logic, change the **CloudFront-Viewer-Country** header to a different country code (for example, Germany):

```http
CloudFront-Viewer-Country: DE
```

> **Note:** Ensure you click the **Save Changes** button to apply the new header value.

Now, reload the **test-site**. You should be redirected to the root path (`/`), as the current logic is configured to route only French traffic to `/index-fr.html`.

### 🚀 Taking it Further: Challenge Yourself

Now that you’ve verified the redirect for France, try expanding the logic on your own. Your goal is to modify the **Lambda@Edge** function to handle German traffic specifically.

**The Goal:**
If the `CloudFront-Viewer-Country` header is `DE`, rewrite the URI to `/index-de.html`.

>**💡 The Hint:**
Create an `/index-de.html` and add some distinct text so you know it's the German version. Then change the logic of the Lambda, your current `if` is currently checking for `'FR'`. To add a second specific condition, you’ll want to use an `else if` block before your final `else`.

It should look something like this structure:
```javascript
if (country === 'FR') {
    // ... logic for France ...
} else if (country === 'DE') { 
    // ... logic for Germany goes here ...
} else {
    // ... default logic ...
}
```

---

## 🧠 What You Just Learned

* ✅ How to run CloudFrontize locally
* ✅ How a **viewer-request hook** works
* ✅ How to debug using the **console**
* ✅ How to inspect and override headers in the **Web UI**
* ✅ How **geo-routing** works at the Edge

---

## 💡 Key Insight

In AWS, testing this would require:

* Deploying to CloudFront
* Waiting ~15 minutes
* Debugging via CloudWatch

With CloudFrontize, you did it in **seconds**.

---

## 🚀 Next Step

Now that you understand the tools, you’re ready to start building real logic.

---
[⬅️ Back to Syllabus](../README.md)
