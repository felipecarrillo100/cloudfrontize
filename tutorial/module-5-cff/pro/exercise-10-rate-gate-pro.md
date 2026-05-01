# Exercise 5.10: The Cookie Gate (Pro)

## 🎯 Your Goal

Implement a stateful security gate using the **Sandwich Architecture**.

---

## 🛠 How to Verify Your Work

#### 1. The Terminal: The sequence
Using the **WebUI** to inject a valid cookie, watch the logs:
```text
[82f1a23c] GET / (Host: localhost:3000)
[82f1a23c] ├─ ○ [CFF: viewer-request] guard.js
[82f1a23c] │    [log] [CFF: Guard] Session verified
[82f1a23c] ├─ 🌐 [Origin] Fetch (S3) -> index.html (200)
[82f1a23c] ├─ ○ [CFF: viewer-response] counter.js
[82f1a23c] │    [log] [CFF: Counter] Baking session cookie
[82f1a23c] ╰─ [Response] Status: 200 [153ms]
```

#### 2. The WebUI: The internal reality
1. Open `http://localhost:3001`.
2. Expand the request in **Real-Time Edge Traffic**. Click the **viewer-response** stage.
3. Click the **HEADERS** tab at the bottom.
4. **Verification**: Confirm that `set-cookie` is present in the final response map.

#### 3. Curl: The raw truth
```bash
curl -i -H "Cookie: session-id=valid" http://localhost:3000/
```

---

[⬅️ Back to Syllabus](../README.md)
