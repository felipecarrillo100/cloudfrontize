# Exercise 1.2: The Librarian (Viewer Request)

## 🎯 Your Goal

Normalize query strings by sorting parameters alphabetically to improve caching.

---

## 🛠 How to Verify Your Work

#### 1. The Terminal: The sequence
Trigger a request with messy parameters: `http://localhost:3000/?z=9&a=1`
```text
[73d6aace] GET /?z=9&a=1 (Host: localhost:3000)
[73d6aace] ├─ ○ [L@E: viewer-request] index.js
[73d6aace] │    [log] [L@E: Librarian] Sorted: a=1&z=9
[73d6aace] ╰─ [Response] Status: 200 [15ms]
```

#### 2. The WebUI: The internal reality
1. Open `http://localhost:3001`.
2. Expand the request in **Real-Time Edge Traffic**. Click the `viewer-request` stage.
3. **Verification**: In the **Stage URI Snapshot**, confirm the path has been normalized to `a=1&z=9`.

#### 3. The Browser: What the user sees
Confirm that your browser URL bar still shows `z=9&a=1`. This proves the Edge mutation is invisible to the user.

---

[⬅️ Back to Syllabus](../README.md)
