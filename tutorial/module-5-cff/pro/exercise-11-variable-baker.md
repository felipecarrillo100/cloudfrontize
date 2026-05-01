# Exercise 5.11: The Variable Baker (Pro)

## 🎯 Your Goal

Inject build-time configuration variables into your running edge code.

---

## 🛠 How to Verify Your Work

#### 1. The Terminal: The sequence
Watch the logs for the baked value injection:
```text
[e3cc0e48] GET / (Host: localhost:3000)
[e3cc0e48] ├─ ○ [CFF: viewer-request] variable-baker.js
[e3cc0e48] │    [log] [CFF: Baker] Environment: PRODUCTION
[e3cc0e48] ╰─ [Response] Status: 200 [14ms]
```

#### 2. The WebUI: The internal reality
1. Open `http://localhost:3001`.
2. Locate your function icon in the **Distribution Pipeline** diagram and click it.
3. **Verification**: In the code viewer, verify that `{{ENVIRONMENT}}` has been replaced with `"PRODUCTION"`.
4. Click the **Origin Fetch** stage in the **Execution Journey**. Click the **HEADERS** tab. Verify the `x-environment` header.

---

[⬅️ Back to Syllabus](../README.md)
