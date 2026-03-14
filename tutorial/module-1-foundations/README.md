# Module 1: Foundations

In this module, you'll learn the fundamental patterns of Lambda@Edge: manipulating headers and performing simple redirects. These are the most common tasks performed at the edge.

> **HINT**: Many exercises in this tutorial rely on `curl` for testing. If you are on Windows, the native command prompt may not support all features. You have a several options to get a compatible environment:
> * **Git for Windows**: Includes **Git Bash**, a Linux-like terminal that comes with a full-featured `curl`.
> * **WSL (Windows Subsystem for Linux)**: Provides a true Linux environment with native `curl` support.
> * **GUI Tools**: You can also use tools like **Postman** or **Insomnia** if you prefer a graphical interface.
>

## Exercises

### 1.1 The Security Guard (Viewer Response)
**Problem**: Your origin server is old and doesn't support modern security headers.
**Goal**: Use a `viewer-response` hook to inject `Strict-Transport-Security` and `X-Content-Type-Options` into every response.
[Go to Exercise 🛠️](./exercise-1/scenario.md)

### 1.2 The Librarian (Viewer Request)
**Problem**: Users are sending query parameters in random order (e.g., `?b=2&a=1`), which causes cache misses for your CDN.
**Goal**: Normalize query strings by alphabetizing them before they reach the cache.
[Go to Exercise 🛠️](./exercise-2/scenario.md)

### 1.3 The Concierge (Viewer Request)
**Problem**: You have a mobile-optimized site at `/mobile/index.html`.
**Goal**: Detect mobile users using the `CloudFront-Is-Mobile-Viewer` header and redirect them seamlessly.
[Go to Exercise 🛠️](./exercise-3/scenario.md)

---
[⬅️ Back to Syllabus](../README.md)
