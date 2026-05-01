# Exercise 3.5: The Cookie Gate (Pro)

## 🎭 The Scenario

AWS enforces a strict separation of concerns for CloudFront Functions. A function attached to the **Viewer Request** context is physically unable to see or modify the **Viewer Response**.

To implement a rate-limit counter using cookies, we must bypass this limitation using a **"Sandwich" Architecture**:

1. **The Guard** (`viewer-request-guard.js`): Inspects the incoming cookie. If the value exceeds the threshold, it blocks the request before it hits your origin.
2. **The Counter** (`viewer-response-counter.js`): Intercepts the response on its way back to the user to update and "write" the new count.

> [!IMPORTANT]
> **HINT**: In **[Exercise 3.4](https://www.google.com/search?q=../advanced/viewer-request-rate-gate.md)**, we implemented a basic request gate. However, that scenario was limited because a single CloudFront Function cannot read and write a cookie while simultaneously allowing/blocking access. This exercise demonstrates a production-ready pattern: **Chaining functions** to implement a fully functional, stateful rate-limiting loop at the edge.

---

## 📖 The Lesson: Chained Sandbox Architecture

AWS enforces a strict isolation policy for CloudFront Functions:
1.  **Context Isolation**: A function running in the **Viewer Request** stage cannot access the `response` object.
2.  **State Isolation**: Functions are stateless. They cannot share memory or variables between requests.

### The "Sandwich" Strategy
To implement logic that both **reads** and **writes** state (like a rate-limit counter), we must use two separate functions:
- **The Guard (Request)**: Runs first. It reads the incoming "State" (the cookie) and decides whether to block or allow.
- **The Counter (Response)**: Runs last. It intercepts the response from the origin and "Writes" the updated state back to the user via a `Set-Cookie` header.

By chaining these two sandboxes together, we create a complete feedback loop at the edge.

---

## 🎯 Your Goal

Implement a **Chained CloudFront Function** loop to forensicly gate traffic:

1.  **The Guard**: Create a `viewer-request` function that reads the `client-request-count` cookie. If the count is 5 or more, return a **429** response.
2.  **The Counter**: Create a `viewer-response` function that increments the `client-request-count` and sets it as a cookie on the outgoing response.
3.  **The Loop**: Use the CloudFrontize simulator to run both functions in sequence and verify the "Sandwich" behavior.

> [!TIP]
> **Forensic Hint**: Open the **Status Modal** in the dashboard. You will see both the **Viewer Request** and **Viewer Response** nodes in the diagram. You can click each one to inspect their individual "Diagnostic Identity" and see how the state is passed through the system.

---

## 🛠️ The Implementation

### 1. The Guard (`viewer-request-guard.js`)

**Hook:** `viewer-request`

This is your first line of defense. It reads the "state" provided by the client.

```javascript
function handler(event) {
    var request = event.request;
    var cookies = request.cookies;
    var limit = 5; 

    var count = 0;
    if (cookies && cookies['client-request-count']) {
        count = parseInt(cookies['client-request-count'].value);
    }

    if (count >= limit) {
        // Short-circuit: The request never reaches the origin
        return {
            statusCode: 429,
            statusDescription: 'Too Many Requests',
            body: 'Rate limit reached! Your cookie count is ' + count
        };
    }

    return request;
}
```

### 2. The Counter (`viewer-response-counter.js`)

**Hook:** `viewer-response`

Since the Guard cannot modify the outgoing response, this second function handles the "write" operation.

```javascript
function handler(event) {
    var request = event.request;
    var response = event.response;
    var cookies = request.cookies;

    var count = 0;
    if (cookies && cookies['client-request-count']) {
        count = parseInt(cookies['client-request-count'].value);
    }

    // Increment and send back to the client
    var newCount = count + 1;

    response.cookies['client-request-count'] = {
        value: newCount.toString(),
        attributes: "Path=/; Max-Age=300" 
    };

    return response;
}
```

---

## 🚀 Running the Dual-Hook Simulation

The `cloudfrontize` simulator allows you to replicate this mandatory AWS behavior by pointing to the folder containing your chained logic:

```bash
cloudfrontize www --cff ./tutorial/module-5-cff/pro/cff10 --debug
```

*Note: The simulator will automatically detect and apply the functions within the `cff10` directory to their respective hooks.*

---

---

## 🧪 How to Test (The Forensic Validation)

### 1. The Visual Chain (Web UI)
Open the **Web UI** (`http://localhost:3001`) to see the "Sandwich" architecture in action.

1.  **First Request (Count 0 -> 1)**:
    - Run: `curl -c cookies.txt http://localhost:3000/`
    - Look at the **Timeline**. You will see:
        - `[CFF: viewer-request]` (Guard) -> **Passed**
        - `[Origin Fetch]` -> **Success**
        - `[CFF: viewer-response]` (Counter) -> **Injected Cookie**
2.  **Subsequent Requests**:
    - Run: `curl -b cookies.txt -c cookies.txt http://localhost:3000/`
    - Watch the **Logs** tab in the UI. You'll see the Guard detecting the count and the Counter incrementing it.
3.  **The Block (Count 5)**:
    - On the 6th request, watch the **Stage Trace**.
    - The request should stop at the **Guard** with a `429` status.
    - The **Origin Fetch** and **Viewer Response** stages will be **skipped**.

### 2. Diagnostic Identity
- Click the **Viewer Request** node: Verify the Guard sees the incoming cookie.
- Click the **Viewer Response** node: Verify the Counter is generating the correct `Set-Cookie` header.

### 3. Performance Profiling
Notice the combined CPU time of the chain. Even with two sandboxes, the total execution time should stay well within production limits.

---

## 📊 Summary of the Request Flow

| Step | Component | Action |
| --- | --- | --- |
| **1** | **Viewer Request (Guard)** | Reads cookie. If < 5, passes request forward. |
| **2** | **Origin (Paws App)** | Processes the request and returns the page content. |
| **3** | **Viewer Response (Counter)** | Reads cookie, adds 1, and attaches `Set-Cookie` to the response. |
| **4** | **Viewer Request (Guard)** | If count is 5, returns `429` immediately. **Origin is never hit.** |

---

## 🎓 Why This Architecture is Mandatory

In CloudFront, the **Viewer Request** and **Viewer Response** are two entirely different execution contexts:

* **Viewer Request:** Can only modify the request or return a "Short-circuit" response. It **cannot** access the `response` object.
* **Viewer Response:** Can modify the response (headers, cookies) before it hits the user, but it is **too late** to block the request from hitting your origin server.

By splitting these into `-guard` and `-counter`, we respect the AWS execution model while achieving a stateful result at the edge.

---
[⬅️ Back to Syllabus](../README.md)
