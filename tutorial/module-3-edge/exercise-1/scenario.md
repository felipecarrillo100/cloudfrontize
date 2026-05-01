# Exercise 3.1: The Bouncer (Viewer Request)

## 🎯 Your Goal

Implement a Basic Auth challenge to protect your admin dashboard.

---

## 🛠 How to Verify Your Work

#### 1. The Terminal: The sequence
Watch the logs for the challenge and the subsequent success:
```text
[79e71436] GET /admin (Host: localhost:3000)
[79e71436] ├─ ○ [L@E: viewer-request] index.js
[79e71436] │    [log] [L@E: Guard] Challenging for credentials
[79e71436] ╰─ [Response] Status: 401 [45ms]
```

#### 2. The WebUI: The internal reality
1. Open `http://localhost:3001`.
2. Locate the failed request in **Real-Time Edge Traffic**. 
3. **Verification**: In the **Distribution Pipeline**, the **Origin** node should be dark. The bouncer stopped the request.

#### 3. Curl: The raw truth
Surgically verify the challenge:
```bash
curl -I http://localhost:3000/admin
```

---

[⬅️ Back to Syllabus](../README.md)
