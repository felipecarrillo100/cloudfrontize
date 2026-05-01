# 🧪 Intro: Debugging the "Invisible" Edge

Welcome! In this first exercise, you won't be writing any code. Instead, you are going to master the most critical skill in Edge Engineering: Observability. You will learn how to see exactly what is happening inside the **CloudFront pipeline** as requests are intercepted and transformed.



The code snippet provided for this exercise is a L@E function that enables you to serve two different contents to users based on their country of origin. By using the Cloudfrontize emulator, you can simulate different geographic locations at will and watch the logic in action.

---

## 📖 The Problem: The Black Box

Debugging a CloudFront Function or Lambda@Edge is hard because it happens in the "Dark Space" between the user’s browser and your server. Usually, if something goes wrong, you're just left guessing.

CloudFrontize gives you **4 ways to see inside that black box**.

### 1. The Browser: What the user sees
This is your first check. Does the page look right? Does the redirect happen? Use the browser's **Network Tab (F12)** to see the final status codes and headers.

### 2. Curl: The raw truth
Sometimes browsers cache things or hide headers. `curl` is your surgical tool to see the raw, unedited HTTP response from the server without any "browser magic" getting in the way.

### 3. The Terminal: The sequence
Every request triggers a log in your terminal. This is where you see the sequence of events. If you put a `console.log()` in your code, it shows up here. 

### 4. The WebUI (Visual Control Plane): The internal reality
Running on port **3001**, this is your X-ray machine. You can click on any stage of the request to see exactly how your code changed the URI or the Headers before the request even reached your server.

---

## ▶️ Step 1 – Run the Demo

Start the emulator:

```bash
cloudfrontize www --edge ./viewer-request-geo.js --debug --webui 3001
```

---

## 🌐 Step 2 – Witness a Redirect

1. Open [http://localhost:3000](http://localhost:3000). You see the default page.
2. Check your **Terminal**. You'll see a log entry showing a request from the "US".
3. Now, let's "teleport" to France. Open the **WebUI** ([http://localhost:3001](http://localhost:3001)).

### In the WebUI:
1. In the **Header Intelligence** panel (left), click **FR** (France).
2. Click **Simulation Active**.
3. Refresh [http://localhost:3000](http://localhost:3000).

> **Troubleshooting**: If you do not see updates reflected in your browser console or the WebUI, it is likely that your browser has cached previous requests and is no longer fetching fresh data from CloudFrontize. You have two main options to resolve this issue:
>
>* Use an Incognito/Private Window: Opening your site in a private window (the name varies by browser) ensures that no previous cache is used.
>* Manual Cache Clear: You can manually clear your browser's cache or use a Hard Refresh (typically Ctrl + F5 or Cmd + Shift + R) before refreshing the page to force new requests.
---

## 🇫🇷 Step 3 – How to Verify the Change

### 1. The Browser
You are now seeing the French page. The URL didn't change, but the content did. This is an **Internal Rewrite**.

### 2. The Terminal
You'll see a new log entry in your CLI. Look for the `[log]` line confirming your code executed:
`[log] Rewriting to French page`

### 3. The WebUI
Find the request in the **Real-Time Edge Traffic** list and expand it. In the **Execution Journey**, click the `viewer-request` stage. Look at the **Stage URI Snapshot**—you'll see it was changed to `/index-fr.html`.

---

[⬅️ Back to Syllabus](../README.md)
