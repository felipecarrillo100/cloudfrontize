# Exercise 5.1: The Traffic Director

## 🎯 Your Goal

Implement a **CloudFront Function** that performs a redirect from `/promo` to `/summer-sale`.

---

## 🛠 How to Verify Your Work

#### 1. The Browser: What the user sees
1. Visit `http://localhost:3000/promo`.
2. **Observation**: Your browser should instantly redirect to `http://localhost:3000/summer-sale`.
3. Open **Developer Tools** -> **Network** tab. Verify the status code is **301**.

#### 2. Curl: The raw truth
```bash
curl -I http://localhost:3000/promo
```

#### 3. The Terminal: The sequence
Watch the logs in your CLI:
```text
[79e71436] GET /promo (Host: localhost:3000)
[79e71436] ├─ ○ [CFF: viewer-request] viewer-request-redirect.js
[79e71436] │    [log] [CFF: Director] Redirecting /promo -> /summer-sale
[79e71436] ╰─ [Response] Status: 301 [5ms]
```

#### 4. The WebUI: The internal reality
1. Open `http://localhost:3001`.
2. Expand the request in **Real-Time Edge Traffic**.
3. Observe the **Distribution Pipeline**. The **Origin** node is dark, proving the redirect happened entirely at the edge.

---

[⬅️ Back to Syllabus](../README.md)
