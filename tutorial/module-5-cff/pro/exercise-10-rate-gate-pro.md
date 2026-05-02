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

> [!IMPORTANT]
> ### 🛑 The CFF Contract: Chained Isolation
> CloudFront Functions execute in a specialized V8 sandbox that only supports **ECMAScript 5.1**. 
> 1. **Context Isolation**: A `viewer-request` function **cannot** access the `response` object. A `viewer-response` function **cannot** block a request from hitting the origin.
> 2. **No `const` or `let`**: You must use `var` for all variable declarations in both files.
> 3. **The Sandwich Pattern**: You must use both hooks to implement a read-and-write state loop.

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

### 1. The Execution Journey (Visual Control Plane)
Open the **WebUI** (`http://localhost:3001`) to see the "Sandwich" architecture in action.

1.  **First Request (Count 0 -> 1)**:
    - Run: `curl -c cookies.txt http://localhost:3000/`
    - In the **Real-time Edge Traffic** list, click the request row to expand the **Execution Journey**.
    - In the journey tree, audit the stations:
        - **[CFF: viewer-request]** (Guard) -> Passed (Request continues to origin).
        - **📦 Origin** -> Success.
        - **[CFF: viewer-response]** (Counter) -> Injected Cookie (Check the **State Inspector** -> **Header Snapshots** for `Set-Cookie`).
2.  **Subsequent Requests**:
    - Run: `curl -b cookies.txt -c cookies.txt http://localhost:3000/`
    - Monitor the journey tree as the count increments in the **State Inspector**.
3.  **The Block (Count 5)**:
    - On the 6th request, observe the **Execution Journey**.
    - The request should stop at the **[CFF: viewer-request]** station (Short-Circuit) with a `429` status.
    - The **Origin Fetch** and **Viewer Response** stages will be **skipped**.
    - Select the **[CFF: viewer-request]** station and verify the status in the **State Inspector**.

---

## 📊 Summary of the Request Flow

| Step | Component | Action |
| --- | --- | --- |
| **1** | **Viewer Request (Guard)** | Reads cookie. If < 5, passes request forward. |
| **2** | **Origin (Paws App)** | Processes the request and returns the page content. |
| **3** | **Viewer Response (Counter)** | Reads cookie, adds 1, and attaches `Set-Cookie` to the response. |
| **4** | **Viewer Request (Guard)** | If count is 5, returns `429` immediately. **Origin is never hit.** |

---

## 🎓 Learning More
**AWS Documentation**: [CloudFront Functions](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-functions.html)

**Keywords**: `CloudFront Function chaining`, `viewer-response Set-Cookie`, `Edge stateful logic`, `Sandwich Architecture`

---

> [!CAUTION]
> ### 🛑 Forensic Troubleshooting: Port 3000 Hangups
> If the emulator fails to start because "Port 3000 is already in use," it means a previous session didn't close properly. 
> 1. Run: `netstat -ano | findstr :3000` to find the PID.
> 2. Run: `taskkill /F /PID <PID_NUMBER>` to clear the ghost process.

In CloudFront, the **Viewer Request** and **Viewer Response** are two entirely different execution contexts:

* **Viewer Request:** Can only modify the request or return a "Short-circuit" response. It **cannot** access the `response` object.
* **Viewer Response:** Can modify the response (headers, cookies) before it hits the user, but it is **too late** to block the request from hitting your origin server.

By splitting these into `-guard` and `-counter`, we respect the AWS execution model while achieving a stateful result at the edge.

---
[⬅️ Back to Syllabus](../README.md)
