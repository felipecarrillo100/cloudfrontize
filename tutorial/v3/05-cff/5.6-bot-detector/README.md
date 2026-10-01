# 5.6 The Bot Detector

## 🎭 The Scenario
Scrapers are copying your catalog every night. Most of them don't even hide: their User-Agent says `Scrapy`, `python-requests` or `crawler`. You want to block them at the edge, without blocking Google.

## 📖 The Lesson: Reading Request Headers

`event.request.headers['user-agent'].value` is the viewer's User-Agent. A **viewer-request** function can check it on every request, before the cache, and answer `403` for unwanted clients.

Order matters: check the **allow list** (search engines you want) before the **block list**, since `Googlebot` contains "bot".

## 🗂️ This Project

| Path | What it is |
|---|---|
| `functions/cloudfront/viewer-request.bot-detector.js` | The Bot Detector (the solution), on **viewer-request** |
| `checks.json` | What this tutorial must do, checked automatically |

## 🎯 Your Goal
Block requests whose User-Agent is missing or contains `bot`, `spider`, `crawler`, `scrapy`, `python-requests` or `curl/`, except Googlebot, Bingbot and DuckDuckBot. To practice, replace the function with:

```javascript
async function handler(event) {
    const header = event.request.headers['user-agent'];
    // TODO: return a 403 response for unwanted clients
    return event.request;
}
```

## 🛠️ Run It
From this folder:
```bash
cloudfrontize validate     # checks the project against AWS rules
cloudfrontize --webui      # serves it on http://localhost:3000, with the workbench on http://localhost:3001
cloudfrontize check        # runs checks.json
```

## 🧪 How to Test
```bash
curl -I http://localhost:3000/index.html                                     # 403: curl is blocked
curl -I -A "Mozilla/5.0 (compatible; Googlebot/2.1)" http://localhost:3000/index.html   # 200
```
In the workbench, the **Viewer** inspector's **Device** presets set a browser User-Agent, and *Test request* sends any headers you like.

## 💡 Fidelity Tips
- **The User-Agent is whatever the client says.** This stops honest scrapers only; anyone can claim to be Googlebot. For bots that lie, use **AWS WAF Bot Control**, which verifies search engines and detects automation.
- **Device headers.** CloudFront can also tell you the device type (`CloudFront-Is-Mobile-Viewer`…), which CloudFront Functions can read on viewer-request: see [1.3 The Concierge](../../01-foundations/1.3-concierge/README.md).

## 🎓 Learning More
- **AWS**: [AWS WAF Bot Control](https://docs.aws.amazon.com/waf/latest/developerguide/waf-bot-control.html)
