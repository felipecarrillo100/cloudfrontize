# 1.12 The Redirect Map

## 🎭 The Scenario
Marketing creates short links (`/summer`) for every campaign, and the content team keeps retiring old pages. Each change has meant editing and redeploying a function. You'll move the redirect list **out of the code** into a CloudFront KeyValueStore, so the list can change without touching the function.

## 📖 The Lesson

### CloudFront KeyValueStore
A **key value store** is a small, global data store that CloudFront Functions can read at the edge. AWS designed it so that *"you make updates to function code and updates to the data associated with a function independently of each other"*. Typical uses are redirect maps, feature flags, A/B test splits and allow-lists.

- A function can be associated with **one** key value store.
- It needs **runtime 2.0** (`"runtime": "cloudfront-js-2.0"`).
- Values are strings, up to 1,024 characters; keys up to 512 characters; a store up to 5 MB.

### Reading it from a function
```javascript
import cf from 'cloudfront';
const kvs = cf.kvs();                                // the store associated with this function

const exists = await kvs.exists('/summer');          // true or false
const text   = await kvs.get('/summer');             // the value as a string
const data   = await kvs.get('/summer', { format: 'json' }); // parsed JSON ('bytes' is also available)
const meta   = await kvs.meta();                     // { keyCount, creationDateTime, lastUpdatedDateTime }
```
`get()` fails for a key that doesn't exist, so check with `exists()` first, or use `try`/`catch`.

### The file
In CloudFrontize a store is a JSON file in the **same format AWS imports from S3**, so you can import this exact file into a real store:

```json
{
  "data": [
    { "key": "/summer", "value": "{\"location\":\"/promo/summer-sale.html\",\"status\":302}" }
  ]
}
```
Keys can't repeat. `cloudfrontize validate` checks the format and the size limits.

## 🗂️ This Project

| Path | What it is |
|---|---|
| `functions/cloudfront/viewer-request.redirect-map.js` | The CloudFront Function (runtime 2.0), on **viewer-request** |
| `kvs/redirects.json` | The key value store: path → `{ location, status }` |
| `cloudfrontize.json` | The function, its `"keyValueStore": "redirects"`, and the store under `keyValueStores` |
| `checks.json` | What this tutorial must do, checked automatically |

## 🎯 Your Goal
Look up the requested path (lower-cased) in the store. If it's there, answer with its redirect; otherwise let the request continue to the origin. Use `cache-control: max-age=3600` for permanent (301) redirects and `no-store` for temporary (302) ones.

## 🛠️ Run It
From this folder:
```bash
cloudfrontize validate
cloudfrontize --webui
```

## 🧪 How to Test
```bash
curl -sI http://localhost:3000/summer        # 302, Location: /promo/summer-sale.html
curl -sI http://localhost:3000/Gallery-2023  # 301, Location: /index.html
curl -sI http://localhost:3000/              # 200 from the origin
```
Now add an entry to `kvs/redirects.json`, save, and request it: CloudFrontize reloads the store without a restart. That's the point of a key value store: data changes, the code doesn't.

## 💡 Fidelity Tips
- **No other async work.** CloudFront Functions can't make network calls or use timers. In CloudFrontize, a function that awaits something other than a key value store read fails, as it would in AWS.
- **Time doesn't move.** Inside a run, `Date` always returns the function's start time, as AWS documents, so you can't measure elapsed time.
- **Avoid promise combinators.** AWS warns that `Promise.all()` over several `get()` calls can exceed the function's memory limit. Read values one at a time with `await`.

## 🎓 Learning More
- **AWS**: [Amazon CloudFront KeyValueStore](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/kvs-with-functions.html)
- **AWS**: [Helper methods for key value stores](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/functions-custom-methods.html)
- **AWS**: [File format for key-value pairs](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/kvs-with-functions-create-s3-kvp.html)
