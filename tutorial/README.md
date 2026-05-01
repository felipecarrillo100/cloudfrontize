# 🎓 CloudFrontize Academy

Welcome to the CloudFrontize Academy. This tutorial is designed to turn you into an **Edge Architect** by giving you hands-on experience with Lambda@Edge and CloudFront Functions in a high-fidelity forensic environment.

## 🗺️ The Path to Mastery

The tutorial is organized into five thematic modules. Each module contains real-world scenarios, architectural explanations, and hands-on exercises.

---

## 🛠️ The Forensic Toolset

To get the most out of this tutorial, you need the right diagnostic lenses.

### 1. The Browser (Port 3000)
Best for: Verifying **Public Responses** (Redirects, 403s) and seeing how a human experiences the site.

### 2. The Visual Control Plane (Port 3001)
Best for: **The Truth**. This is the only place to see **Internal Mutations** (Rewrites, Header Injections) that are invisible to the outside world.

### 3. The Professional Audit (Curl)
Best for: Surgical precision, sending custom headers, and auditing POST bodies.

> [!CAUTION]
> **Windows Users**: Avoid using `curl` in PowerShell or CMD. In PowerShell, `curl` is often a "fake" alias that behaves differently (it's actually `Invoke-WebRequest`). For a fully compliant experience, we recommend using **Git Bash** (included with Git for Windows) or **WSL**.

---

### [Intro: CloudFrontize Development Environment](./intro/README.md)
*Learn how to run, test, and debug your Lambda@Edge and CloudFront Functions locally.*

- **Intro – Run & Debug**: Use CloudFrontize to execute your logic and debug it using both the console and the Visual Control Plane (Web UI).

---

### [Module 1: Foundations](./module-1-foundations/README.md)
*Master the fundamental patterns of edge computing.*

- **1.1 The Security Guard**: Inject security headers into responses.
- **1.2 The Librarian**: Normalize query strings to improve cache hit ratios.
- **1.3 The Concierge**: Redirect mobile users to a specialized site.

---

### [Module 2: Origin Intelligence](./module-2-origin/README.md)
*Make smart decisions based on origin behavior and country data.*

- **2.1 The Scientist**: Perform A/B testing at the edge.
- **2.2 The Diplomat**: Route traffic based on viewer country.
- **2.3 The Cloaker**: Sanitize sensitive origin response headers.

---

### [Module 3: Edge Computing (Advanced)](./module-3-edge/README.md)
*Generate dynamic content and protect your infrastructure.*

- **3.1 The Bouncer**: Implement Basic Auth at the edge.
- **3.2 The Architect**: Generate entire HTML responses without a backend.
- **3.3 The Inspector**: Inspect request bodies for security threats.

---

### [Module 5: CloudFront Functions (CFF)](./module-5-cff/README.md)
*High-performance, low-cost micro-logic at the edge.*

- **5.1 Traffic Director**: Ultra-fast redirects.
- **5.2 Header Injector**: Tagging requests with custom metadata.
- **5.3 Cache Master**: Controlling cache behavior via headers.
- **5.4 Query Normalizer**: Cleaning up tracking parameters for better caching.

---
[⬅️ Back to Project Root](../README.md)
