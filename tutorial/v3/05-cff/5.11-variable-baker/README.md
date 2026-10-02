# 5.11 The Variable Baker

## 🎭 The Scenario
Your Content-Security-Policy has to be relaxed during development (the dev server injects inline scripts and a live-reload WebSocket) and strict in production. Same function, different values per environment.

## 📖 The Lesson: Baking, Within 10 KB

CloudFront Functions have **no environment variables**, no network and no file system: everything a function knows is in its code (or a key value store). Configuration that changes per environment is **baked**: write `__NAME__` in the code, and the build replaces it.

- `"bake": { "file": "config/bake.env" }` in `cloudfrontize.json` gives the local values; CloudFrontize bakes them in when it loads the function.
- `cloudfrontize build --bake config/production.env` writes the deployable function with production values to `dist/cloudfront/`.

Baking replaces text **as is**, inside your code. Here the policy contains single quotes (`'self'`), so the placeholder is in a double-quoted string: in a single-quoted one, the baked code wouldn't parse, and CloudFrontize (like AWS) would refuse it as a build error.

The **10 KB** limit applies to the code as deployed, after baking: long baked values count. `cloudfrontize build` checks the size of what it writes (and `--level minified` shrinks it).

Same idea as [4.1 The Baker](../../04-production/4.1-baker/README.md), for Lambda@Edge.

## 🗂️ This Project

| Path | What it is |
|---|---|
| `functions/cloudfront/viewer-response.variable-baker.js` | The Variable Baker: sets the baked policy on every response |
| `config/bake.env` / `config/production.env` | Local and production values |
| `checks.json` | What this tutorial must do, checked automatically |

## 🎯 Your Goal
Use the `__CSP__` placeholder for the policy (mind the quotes), check it locally, and build for production.

## 🛠️ Run It
From this folder:
```bash
cloudfrontize validate     # checks the project against AWS rules
cloudfrontize --webui      # serves it on http://localhost:3000, with the workbench on http://localhost:3001
cloudfrontize check        # runs checks.json
```

## 🧪 How to Test
```bash
curl -sI http://localhost:3000/index.html | grep -i content-security-policy     # the relaxed policy
cloudfrontize build --bake config/production.env --level minified
cat dist/cloudfront/variable-baker.js                                            # the strict one, baked in
```

## 💡 Fidelity Tips
- **Values that change often** (feature flags, allow lists) belong in a **KeyValueStore**: no rebuild to change them ([5.12 The Redirect Map](../5.12-redirect-map/README.md)).
- **Never bake secrets** into a CloudFront Function: the code can be read by anyone with access to the distribution's configuration.

## 🎓 Learning More
- **AWS**: [Quotas on CloudFront Functions](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-limits.html#limits-functions)
