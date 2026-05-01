# 🌐 Module 5: CloudFront Functions (CFF)

**CloudFront Functions (CFF)** are ultra-fast, lightweight JavaScript functions that execute directly at the Edge. 

They are perfect for high-speed tasks where every millisecond counts, but because they run in a restricted sandbox, they can be tricky to debug.

---

## 🛠 How to Verify Your Code Works

To master CloudFront logic, you need to use 4 different tools to see what's happening inside the request pipeline:

### 1. The Browser: What the user sees
Use this for visual confirmation. Does the redirect happen? Is the maintenance page showing? Check the **Network Tab (F12)** for cookies and final response headers.

### 2. Curl: The raw truth
The ultimate surgical tool. Use `curl -I` to see the exact, raw HTTP headers without any browser caching or hidden behavior.

### 3. The Terminal: The sequence
Every request shows up here in real-time. This is where your `console.log()` messages appear. Use it to track the sequence of events and match **Request IDs**.

### 4. The WebUI (Visual Control Plane): The internal reality
Running on port **3001**, this is your X-ray machine. Use the **Execution Journey** to see stage-by-stage snapshots of how your code mutated the **URI**, **Headers**, and **Body**.

---

## 🚀 The Curriculum

### 🟢 Beginner: Mastering the Basics
1. [Traffic Director (Redirect)](beginner/exercise-1-traffic-director.md) – Mastering edge-based redirects.
2. [Header Injector](beginner/exercise-2-header-injector.md) – Injecting "Invisible" metadata.
3. [Simple Blocker](beginner/exercise-3-simple-blocker.md) – Rejecting requests at the gate.

### 🟡 Intermediate: Request Logic
4. [Query Normalizer](intermediate/exercise-4-query-normalizer.md) – Cleaning up tracking parameters.
5. [Geo Router](intermediate/exercise-5-geo-router.md) – Routing based on user location.
6. [Bot Detector](intermediate/exercise-6-bot-detector.md) – Detecting and blocking automated scrapers.

### 🔴 Advanced: Traffic Engineering
7. [A/B Testing Router](advanced/exercise-7-ab-router.md) – Splitting traffic via cookies.
8. [Header Policy](advanced/exercise-8-header-policy.md) – Enforcing security standards.
9. [Rate Gate](advanced/exercise-9-rate-gate.md) – Throttling traffic at the edge.

### 💎 Pro: Mastery
10. [The Cookie Gate](pro/exercise-10-rate-gate-pro.md) – Stateful logic (The "Sandwich" pattern).
11. [The Variable Baker](pro/exercise-11-variable-baker.md) – Injecting config variables at build-time.

---

[⬅️ Back to Syllabus](../README.md)
