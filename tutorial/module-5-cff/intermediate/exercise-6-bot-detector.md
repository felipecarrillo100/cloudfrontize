# Exercise 5.6: The Bot Detector

## 🎯 Your Goal

Detect and block bots by returning a `403 Forbidden` if the `User-Agent` contains "bot".

---

## 🛠 How to Verify Your Work

#### 1. Curl: The raw truth
Surgically verify the block:
```bash
curl -i -A "Googlebot" http://localhost:3000/
```

#### 2. The Terminal: The sequence
Watch the logs:
```text
[e05cb479] GET / (Host: localhost:3000)
[e05cb479] ├─ ○ [CFF: viewer-request] viewer-request-bot-detector.js
[e05cb479] │    [log] [CFF: Guard] Bot detected: googlebot
[e05cb479] ╰─ [Response] Status: 403 [10ms]
```

#### 3. The WebUI: The internal reality
1. Open `http://localhost:3001`.
2. Locate the request in **Real-Time Edge Traffic**.
3. **Verification**: In the **Distribution Pipeline**, the **Origin** node is dark. The journey stopped at the edge.

---

[⬅️ Back to Syllabus](../README.md)
