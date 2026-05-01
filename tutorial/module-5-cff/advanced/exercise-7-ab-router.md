# Exercise 5.7: The A/B Router

## 🎯 Your Goal

Implement an A/B router that pivots users to `/test-page` if they have the `ab_test_group=B` cookie.

---

## 🛠 How to Verify Your Work

#### 1. The WebUI: The internal reality
1. Open `http://localhost:3001`.
2. In the **Header Intelligence** panel, click **Add Simulation Header**.
3. Add a `Cookie` header: `ab_test_group=B`. Click **Simulation Active**.
4. Refresh `http://localhost:3000/`.
5. Expand the request in **Real-Time Edge Traffic**. Click the **Origin Fetch** stage.
6. **Verification**: In the **Stage URI Snapshot**, confirm the path is updated to `/test-page`.

#### 2. The Terminal: The sequence
Watch the logs:
```text
[82f1a23c] GET / (Host: localhost:3000)
[82f1a23c] ├─ ○ [CFF: viewer-request] viewer-request-ab-router.js
[82f1a23c] │    [log] [CFF: Router] A/B Pivot -> /test-page
[82f1a23c] ╰─ [Response] Status: 200 [14ms]
```

#### 3. The Browser: What the user sees
Confirm the URL in your address bar stays at `/`, but you see the "Test" content.

---

[⬅️ Back to Syllabus](../README.md)
