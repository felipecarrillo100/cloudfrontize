# Exercise 2.3: The Cloaker (Origin Response)

## 🎯 Your Goal

Sanitize outgoing responses by stripping sensitive server headers.

---

## 🛠 How to Verify Your Work

#### 1. The Terminal: The sequence
Using the **WebUI** (Origin tab) to inject a server header, watch the logs:
```text
[055c22ed] GET / (Host: localhost:3000)
[055c22ed] ├─ 🌐 [Origin] Fetch (S3) -> index.html (200)
[055c22ed] ├─ ○ [L@E: origin-response] index.js
[055c22ed] │    [log] [L@E: Cloaker] Stripping leaking headers
[055c22ed] ╰─ [Response] Status: 200 [153ms]
```

#### 2. The WebUI: The internal reality
1. Open `http://localhost:3001`.
2. Expand the request in **Real-Time Edge Traffic**. Click the **HEADERS** tab.
3. **Verification**: Compare **ORIGIN RETURNED** (dirty) with **FINAL RESPONSE** (clean). The sensitive headers should be gone.

#### 3. Curl: The raw truth
```bash
curl -I http://localhost:3000/
```

---

[⬅️ Back to Syllabus](../README.md)
