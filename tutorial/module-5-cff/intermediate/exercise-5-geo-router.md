# Exercise 5.5: The Geo Router

## 🎯 Your Goal

Perform an Internal Rewrite to a region-specific folder (e.g., `/mx/`) based on the country header.

---

## 🛠 How to Verify Your Work

#### 1. The WebUI: The internal reality
1. Open `http://localhost:3001`.
2. In the **Header Intelligence** panel, click **MX** (Mexico). Click **Simulation Active**.
3. Refresh `http://localhost:3000/`.
4. Expand the request in **Real-Time Edge Traffic**.
5. In the **Execution Journey**, click the **Origin Fetch** stage.
6. **Verification**: In the **Stage URI Snapshot**, confirm the path is updated to `/mx/`.

#### 2. The Terminal: The sequence
Watch the logs:
```text
[e3cc0e48] GET / (Host: localhost:3000)
[e3cc0e48] ├─ ○ [CFF: viewer-request] viewer-request-geo-router.js
[e3cc0e48] │    [log] [CFF: Router] Geo Pivot -> /mx/
[e3cc0e48] ╰─ [Response] Status: 200 [18ms]
```

#### 3. Curl: The raw truth
```bash
curl -H "CloudFront-Viewer-Country: MX" http://localhost:3000/
```

---

[⬅️ Back to Syllabus](../README.md)
