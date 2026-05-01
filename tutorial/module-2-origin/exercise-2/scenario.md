# Exercise 2.2: The Diplomat (Origin Request)

## 🎯 Your Goal

Automatically route users to localized content folders based on their country.

---

## 🛠 How to Verify Your Work

#### 1. The Terminal: The sequence
Using the **WebUI** (Mexico preset), watch the logs:
```text
[73d6aace] GET / (Host: localhost:3000)
[73d6aace] ├─ ○ [L@E: origin-request] index.js
[73d6aace] │    [log] [L@E: Router] Geo Pivot: /MX/
[73d6aace] ├─ 🌐 [Origin] Fetch (S3) -> /MX/index.html (200)
[73d6aace] ╰─ [Response] Status: 200 [15ms]
```

#### 2. The WebUI: The internal reality
1. Open `http://localhost:3001`.
2. Expand the request in **Real-Time Edge Traffic**. Click the **Origin Fetch** stage.
3. **Verification**: In the **Stage URI Snapshot**, confirm the path is `/MX/`.

#### 3. Curl: The raw truth
```bash
curl -H "CloudFront-Viewer-Country: MX" http://localhost:3000/
```

---

[⬅️ Back to Syllabus](../README.md)
