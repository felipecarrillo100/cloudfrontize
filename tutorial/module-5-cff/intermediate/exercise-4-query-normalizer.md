# Exercise 5.4: The Query Normalizer

## 🎯 Your Goal

Strip tracking parameters (like `utm_source`) from the query string at the edge.

---

## 🛠 How to Verify Your Work

#### 1. The Browser: What the user sees
1. Visit `http://localhost:3000?utm_source=google&id=123`.
2. **Observation**: The URL in your address bar stays the same. The cleanup is invisible to the user.

#### 2. The Terminal: The sequence
Watch the logs:
```text
[c9c1ba32] GET /?utm_source=google (Host: localhost:3000)
[c9c1ba32] ├─ ○ [CFF: viewer-request] viewer-request-query-normalizer.js
[c9c1ba32] │    [log] [CFF: Librarian] Normalizing: /
[c9c1ba32] ╰─ [Response] Status: 200 [15ms]
```

#### 3. The WebUI: The internal reality
1. Open `http://localhost:3001`.
2. Expand the request in **Real-Time Edge Traffic**.
3. In the **Execution Journey**, click the **Origin Fetch** stage.
4. **Verification**: In the **Stage URI Snapshot**, confirm the tracking parameters are gone. Only `?id=123` should remain.

---

[⬅️ Back to Syllabus](../README.md)
