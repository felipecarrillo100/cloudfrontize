# Exercise 2.1: The Scientist (Origin Request)

## 🎯 Your Goal

Perform an internal URI rewrite to a folder without changing the user's URL.

---

## 🛠 How to Verify Your Work

#### 1. The Terminal: The sequence
Using the **WebUI** to inject the cookie, watch the logs:
```text
[82f1a23c] GET /index.html (Host: localhost:3000)
[82f1a23c] ├─ ○ [L@E: origin-request] index.js
[82f1a23c] │    [log] [L@E: Scientist] A/B Pivot: /experimental/index.html
[82f1a23c] ├─ 🌐 [Origin] Fetch (S3) -> /experimental/index.html (200)
[82f1a23c] ╰─ [Response] Status: 200 [153ms]
```
**Verification**: Confirm the origin fetch path in the trace.

#### 2. The WebUI: The internal reality
1. Open `http://localhost:3001`.
2. Expand the request in **Real-Time Edge Traffic**. Click the **Origin Fetch** stage.
3. **Verification**: In the **Stage URI Snapshot**, confirm the path has pivoted to `/experimental/`.

#### 3. The Browser: What the user sees
Confirm the browser URL stays at `/index.html`, while the content is different.

---

[⬅️ Back to Syllabus](../README.md)
