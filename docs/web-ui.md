# Visual Control Plane (WebUI)

CloudFrontize includes an optional, high-performance browser-based UI designed to give you **instant visibility** into your Edge logic. Instead of just relying on terminal logs, you can watch your traffic flow and manipulate headers in real-time.

<div style="display: flex; justify-content: space-around; align-items: center;">
<img alt="Cloudfrontize Web UI" src="https://raw.githubusercontent.com/felipecarrillo100/cloudfrontize/main/assets/cloudfrontize-webui.jpg" width="75%" />
</div>

---

## 🚀 Getting Started

To enable the WebUI, pass the `--webui` flag with your desired port when starting the server:

```bash
cloudfrontize ./www --webui 3001
```

Once running, navigate to `http://localhost:3001` in your browser.

---

## 🧠 Header Intelligence

The "Header Intelligence" panel is one of the most powerful features of the WebUI. It allows you to **inject or override headers** on-the-fly without restarting the server or modifying your code.

### 1. Request Header Injection
Simulate different client environments or trigger specific logic in your Lambda@Edge `viewer-request` or `origin-request` hooks.

*   **How to use:** Enter the `Key` (e.g., `cloudfront-viewer-country`) and `Value` (e.g., `FR`) in the Request Headers section of the UI.
*   **Use Case:** Test Geo-routing, User-Agent detection, or Authorization tokens instantly.
*   **Note:** These headers apply to the *next* request made to your main CloudFrontize port.

### 2. Response Header Injection
Force specific response behaviors or simulate origin headers that your `viewer-response` hooks need to process.

*   **How to use:** Add items to the Response Headers list.
*   **Use Case:** Test how your secure-header hooks handle existing `Cache-Control` or `Content-Security-Policy` headers from the "origin."

---

## 📈 Real-Time Traffic Inspection

The UI uses **Server-Sent Events (SSE)** to provide a live feed of every request hitting the emulator.

*   **Trace View:** See the internal URI transformation path (e.g., how a CFF rewritten path flows into a Lambda@Edge hook).
*   **Telemetry Snapshot:** Instantly view the CPU time consumed by your hooks, helping you stay within the strict AWS 1ms/5ms limits.
*   **Header Lifecycle:** Inspect exactly how headers looked at the Viewer, Origin, and back, highlighting every mutation made by your Edge logic.
*   **Body Inspection:** For POST and PUT requests, the UI displays a snippet (first 1KB) of the request body, which is essential for debugging webhook validations or body-based routing in Lambda@Edge.

---

## 🛠 Troubleshooting the UI

*   **Port Conflicts:** Ensure the port passed to `--webui` is different from your main server port (default 3000).
*   **CORS:** If your web application relies on CORS, ensure you run cloudfrontize with the `--cors` flag to avoid blocked UI telemetry.

---

[⬅️ Back to Main README](../README.md)
