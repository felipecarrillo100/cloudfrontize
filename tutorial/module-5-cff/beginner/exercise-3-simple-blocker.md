# Exercise 5.3: The Simple Blocker

## 🎯 Your Goal

Block all requests to `/admin` at the edge by returning a `403 Forbidden`.

---

## 🛠 How to Verify Your Work

#### 1. Curl: The raw truth
Verify the block surgically:
```bash
curl -i http://localhost:3000/admin
```

#### 2. The Terminal: The sequence
Watch the logs:
```text
[055c22ed] GET /admin (Host: localhost:3000)
[055c22ed] ├─ ○ [CFF: viewer-request] viewer-request-blocker.js
[055c22ed] │    [log] [CFF: Guard] Blocking unauthorized access
[055c22ed] ╰─ [Response] Status: 403 [8ms]
```
**Verification**: Look for the **403** status in the CLI.

#### 3. The WebUI: The internal reality
1. Open `http://localhost:3001`.
2. Locate the request in **Real-Time Edge Traffic**.
3. **Verification**: In the **Distribution Pipeline**, the **Origin** node should be dark. The journey stopped at the edge.

---

[⬅️ Back to Syllabus](../README.md)
