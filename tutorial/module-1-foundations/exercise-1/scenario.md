# Exercise 1.1: The Security Guard (Viewer Response)

## 🎯 Your Goal

Inject security headers into every response leaving CloudFront.

---

## 🛠 How to Verify Your Work

#### 1. The Terminal: The sequence
Watch the logs as you refresh:
```text
[82f1a23c] GET / (Host: localhost:3000)
[82f1a23c] ├─ 🌐 [Origin] Fetch (S3) -> index.html (200)
[82f1a23c] ├─ ○ [L@E: viewer-response] index.js
[82f1a23c] │    [log] [L@E: Guard] Security headers injected
[82f1a23c] ╰─ [Response] Status: 200 [153ms]
```
**Verification**: Look for your custom `[log]` entry.

#### 2. The WebUI: The internal reality
1. Open `http://localhost:3001`.
2. Select the request in **Real-Time Edge Traffic** and expand it.
3. Look at the **HEADERS** tab at the bottom.
4. **Verification**: Compare **ORIGIN RETURNED** (raw) with **FINAL RESPONSE** (secured). Confirm your headers are present.

#### 3. Curl: The raw truth
```bash
curl -I http://localhost:3000
```

---

[⬅️ Back to Syllabus](../README.md)
