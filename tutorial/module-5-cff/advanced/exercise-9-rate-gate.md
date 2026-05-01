# Exercise 5.9: The Rate Gate

## 🎯 Your Goal

Throttle traffic by returning a `429 Too Many Requests` if the request count is too high.

---

## 🛠 How to Verify Your Work

#### 1. Curl: The raw truth
Surgically verify the block:
```bash
curl -i -H "x-request-count: 15" http://localhost:3000/
```

#### 2. The Terminal: The sequence
Using **WebUI** to inject the count, watch the logs:
```text
[055c22ed] GET / (Host: localhost:3000)
[055c22ed] ├─ ○ [CFF: viewer-request] viewer-request-rate-gate.js
[055c22ed] │    [log] [CFF: Shield] Throttling request
[055c22ed] ╰─ [Response] Status: 429 [9ms]
```

#### 3. The WebUI: The internal reality
1. Open `http://localhost:3001`.
2. Observe the **Distribution Pipeline**. The **Origin** node is grayed out.
3. In the **Execution Journey**, click the function stage to see the snapshot.

---

[⬅️ Back to Syllabus](../README.md)
