# Exercise 3.3: The Inspector (Viewer Request)

## 🎯 Your Goal

Perform Deep Packet Inspection to block requests with malicious payloads.

---

## 🛠 How to Verify Your Work

#### 1. Curl: The raw truth
Surgically verify the block:
```bash
curl -d "This contains BLACKLISTED content" http://localhost:3000/
```

#### 2. The Terminal: The sequence
Watch the Inspector analyze the payload:
```text
[055c22ed] POST / (Host: localhost:3000)
[055c22ed] ├─ ○ [L@E: viewer-request] index.js
[055c22ed] │    [log] [L@E: Inspector] Malicious payload detected
[055c22ed] ╰─ [Response] Status: 403 [22ms]
```

#### 3. The WebUI: The internal reality
1. Open `http://localhost:3001`.
2. Select the request in **Real-Time Edge Traffic**. Click the **BODY** tab.
3. **Verification**: You will see the raw malicious payload that triggered the rejection.

---

[⬅️ Back to Syllabus](../README.md)
