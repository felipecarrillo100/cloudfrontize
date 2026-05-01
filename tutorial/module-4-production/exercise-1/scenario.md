# Exercise 4.1: The Baker (Production Workflow)

## 🎯 Your Goal

Master the "Baking Pattern" to inject configuration variables into your edge code.

---

## 🛠 How to Verify Your Work

#### 1. The Terminal: The sequence
Watch the logs for the baked value injection:
```text
[e3cc0e48] GET / (Host: localhost:3000)
[e3cc0e48] ├─ ○ [L@E: viewer-request] index.js
[e3cc0e48] │    [log] [L@E: Baker] Endpoint: https://api.production.com
[e3cc0e48] ╰─ [Response] Status: 200 [14ms]
```

#### 2. The WebUI: The internal reality
1. Open `http://localhost:3001`.
2. Observe the **Distribution Pipeline**. Click your function icon.
3. **Verification**: In the code viewer, confirm the placeholder has been replaced with the live value.
4. Expand a request in **Real-Time Edge Traffic**. Click the **HEADERS** tab. Verify the `x-api-target` header.

---

[⬅️ Back to Syllabus](../README.md)
