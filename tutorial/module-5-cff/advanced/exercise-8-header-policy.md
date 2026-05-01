# Exercise 5.8: The Header Policy

## 🎯 Your Goal

Inject mandatory security headers into every request heading to your origin.

---

## 🛠 How to Verify Your Work

#### 1. The Terminal: The sequence
Watch the logs:
```text
[73d6aace] GET / (Host: localhost:3000)
[73d6aace] ├─ ○ [CFF: viewer-request] viewer-request-header-policy.js
[73d6aace] │    [log] [CFF: Policy] Injecting security markers
[73d6aace] ╰─ [Response] Status: 200 [11ms]
```

#### 2. The WebUI: The internal reality
1. Open `http://localhost:3001`.
2. Expand the request in **Real-Time Edge Traffic**. Click the **Origin Fetch** stage.
3. Click the **HEADERS** tab at the bottom.
4. **Verification**: Confirm that your security headers are present in the final payload heading to the backend.

#### 3. The Browser: What the user sees
Open `http://localhost:3000`. Inspect the **Network** tab.
**Observation**: The injected headers are **missing**. They only exist between the Edge and the Origin.

---

[⬅️ Back to Syllabus](../README.md)
