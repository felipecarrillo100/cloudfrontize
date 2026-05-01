# Exercise 5.2: The Header Injector

## 🎯 Your Goal

Implement a **CloudFront Function** that injects `x-edge-powered-by: { value: 'cloudfrontize' }`.

---

## 🛠 How to Verify Your Work

#### 1. The Browser: What the user sees
1. Open `http://localhost:3000`. Inspect the **Network** tab in DevTools.
2. **Observation**: The header is **missing**. The browser only knows what *it* sent. This proves the mutation is internal.

#### 2. The Terminal: The sequence
Watch the logs in your CLI:
```text
[82f1a23c] GET / (Host: localhost:3000)
[82f1a23c] ├─ ○ [CFF: viewer-request] viewer-request-header.js
[82f1a23c] │    [log] [CFF: Injector] Marking request: /
[82f1a23c] ╰─ [Response] Status: 200 [12ms]
```
**Verification**: Look for your custom `[log]` line.

#### 3. The WebUI: The internal reality
1. Open `http://localhost:3001`.
2. Expand the request in **Real-Time Edge Traffic**.
3. In the **Execution Journey**, click the `viewer-request` stage.
4. **Verification**: In the **Headers** tab, confirm that `x-edge-powered-by` is present in the snapshot.

---

[⬅️ Back to Syllabus](../README.md)
