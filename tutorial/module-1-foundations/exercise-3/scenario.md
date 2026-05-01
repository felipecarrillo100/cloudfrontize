# Exercise 1.3: The Concierge (Viewer Request)

## 🎯 Your Goal

Redirect mobile users to a specialized subdomain.

---

## 🛠 How to Verify Your Work

#### 1. The Terminal: The sequence
Using the **WebUI** (Mobile preset), trigger a request:
```text
[e3cc0e48] GET / (Host: localhost:3000)
[e3cc0e48] ├─ ○ [L@E: viewer-request] index.js
[e3cc0e48] │    [log] [L@E: Concierge] Mobile Redirect -> https://m.example.com/
[e3cc0e48] ╰─ [Response] Status: 302 [8ms]
```

#### 2. The WebUI: The internal reality
1. Open `http://localhost:3001`.
2. Observe the **Distribution Pipeline**. The **Origin** node is dark.
3. In the **Execution Journey**, click the function stage. 
4. Click the **HEADERS** tab. Verify the `location` header in the final response.

#### 3. Curl: The raw truth
```bash
curl -I -H "CloudFront-Is-Mobile-Viewer: true" http://localhost:3000/
```

---

[⬅️ Back to Syllabus](../README.md)
