# Exercise 3.5: The Cookie Gate (Pro)

## 🎭 The Scenario

AWS enforces a strict separation of concerns for CloudFront Functions. A function attached to the **Viewer Request** context is physically unable to see or modify the **Viewer Response**.

To implement a rate-limit counter using cookies, we must bypass this limitation using a **"Sandwich" Architecture**:

1. **The Guard** (`viewer-request-guard.js`): Inspects the incoming cookie. If the value exceeds the threshold, it blocks the request before it hits your origin.
2. **The Counter** (`viewer-response-counter.js`): Intercepts the response on its way back to the user to update and "write" the new count.

> [!IMPORTANT]
> **HINT**: In **[Exercise 3.4](https://www.google.com/search?q=../advanced/viewer-request-rate-gate.md)**, we implemented a basic request gate. However, that scenario was limited because a single CloudFront Function cannot read and write a cookie while simultaneously allowing/blocking access. This exercise demonstrates a production-ready pattern: **Chaining functions** to implement a fully functional, stateful rate-limiting loop at the edge.

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

## 🧪 How to Test (The Validation Loop)

Testing a stateful cookie loop requires `curl` to behave like a browser by storing and sending back cookies.

### 1. The Initial Request (Count = 0)

Run this to start your session and save the first cookie:

```bash
curl -v -I -c cookies.txt http://localhost:3000/
```

* **What to look for:** In the output, you should see `Set-Cookie: client-request-count=1`. This was injected by your **Counter** function.

### 2. The Increment Loop (Count 1 to 4)

Run this command 4 more times. The `-b` flag sends the cookie back, and `-c` updates it with the new value:

```bash
curl -v -I -b cookies.txt -c cookies.txt http://localhost:3000/
```

* **What to look for:** Each time, the origin (the "Paws" app) should return `200 OK`. If you inspect the `cookies.txt` file, you’ll see the count rising.

### 3. The Block (Count = 5)

On your 6th attempt, run the command again:

```bash
curl -i -b cookies.txt http://localhost:3000/
```

* **Expected Result:**
* **Status:** `429 Too Many Requests`
* **Body:** `Rate limit reached! Your cookie count is 5`


* **Why?** The **Guard** function saw the cookie value of `5` and short-circuited the request before it ever reached the origin.

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
