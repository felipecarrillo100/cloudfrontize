# 🌐 CloudFront Functions (CFF) Tutorial

**CloudFront Functions (CFF)** are ultra-fast, lightweight JavaScript functions that execute **at the edge**—directly at AWS CloudFront locations worldwide.

They are ideal for **high-performance, low-latency tasks** such as:

- Redirects and rewrites
- Header injection and normalization
- Query string or cookie handling
- Lightweight access control and bot detection

> ⚡ CloudFront Functions run **before Lambda@Edge**, giving you millisecond-scale execution **without cold starts**.

---

## 🧩 Key Characteristics

| Feature | Description |
|---------|-------------|
| **Execution Time** | ~1 ms |
| **Code Size Limit** | 10 KB |
| **Cold Starts** | None |
| **Runtime** | JavaScript (ECMAScript 5.1, V8 Sandbox) |
| **Cost** | ~$0.10 per 1M requests |
| **Deployment** | Edge locations globally |

> 💡 **Tip:** Keep functions small and efficient—they are designed for **micro-logic at the edge**, not full backend apps.

---

## 🚀 Exercises

### 🟢 Beginner
1. [Traffic Director (Redirect)](beginner/exercise-1-traffic-director.md) – Redirect legacy URLs to new campaign pages.
2. [Header Injector](beginner/exercise-2-header-injector.md) – Add a custom header to verify edge execution.
3. [Simple Blocker](beginner/exercise-3-simple-blocker.md) – Block access to sensitive paths like `/admin`.

### 🟡 Intermediate
4. [Query Normalizer](intermediate/exercise-4-query-normalizer.md) – Strip unnecessary tracking query parameters.
5. [Geo Router](intermediate/exercise-5-geo-router.md) – Route users based on their country header.
6. [Bot Detector](intermediate/exercise-6-bot-detector.md) – Block suspicious bots via User-Agent analysis.

### 🔴 Advanced
7. [A/B Testing Router](advanced/exercise-7-ab-router.md) – Implement simple cookie-based A/B routing.
8. [Dynamic Header Policy](advanced/exercise-8-header-policy.md) – Enforce security headers at the edge.
9. [Rate Gate](advanced/exercise-9-rate-gate.md) – Limit requests based on a header counter.

---

## 📝 Solutions

All solutions are organized by level in the `solutions` folder:

- [Beginner Solutions](solutions/beginner)
- [Intermediate Solutions](solutions/intermediate)
- [Advanced Solutions](solutions/advanced)

> 💡 **Tip:** Start with beginner exercises, verify your implementation using the **CloudFrontize emulator**, become familiar with the simulator before moving to intermediate and advanced challenges.

---

## 🔗 Resources

- [AWS CloudFront Functions Documentation](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-functions.html)
- [CloudFrontize Emulator GitHub](https://github.com/felipecarrillo100/cloudfrontize-lambda-at-edge) – Run CFF locally for testing.
- [JavaScript EC5 Reference](https://www.ecma-international.org/ecma-262/5.1/) – Compatible JS version for CFF.

---

## 💡 Tips for Success

- **Keep it lightweight:** Functions must stay under 10 KB.
- **Test locally:** Use CloudFrontize to emulate requests and inspect headers, redirects, or blocked paths.
- **Edge-first thinking:** CFF runs **before your origin**, so logic applied here prevents unnecessary backend load.
- **Use console logging sparingly:** Edge logging is limited, keep debug info concise.
