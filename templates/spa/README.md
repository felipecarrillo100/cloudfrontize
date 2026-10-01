# Single-page app

Serves a single-page app (React, Vue, Angular, Svelte…) the way it's usually deployed with CloudFront: every URL that isn't a file returns `index.html`, and the app's router shows the right page. Deep links and page reloads work.

## How it works

`functions/cloudfront/viewer-request.spa-router.js` is a **CloudFront Function** on **viewer-request**. When the last segment of the path has no file extension (`/`, `/settings`, `/users/42`), it rewrites the URI to `/index.html`. Files like `/assets/app.js` pass through untouched.

The rewrite happens before CloudFront looks in its cache, so every route shares one cached `index.html`.

Replace `origins/www` with your app's build output (for example `dist/` from `npm run build`).

## Another way: custom error responses

Many CloudFront setups instead turn the origin's 403/404 into `/index.html` with status 200 (a *custom error response*). CloudFrontize emulates that with `"distribution": { "spa": true }`. The function above is more precise: a missing image still returns an error instead of a page of HTML.

## Try it

```bash
cloudfrontize --webui        # http://localhost:3000/users/42
cloudfrontize check          # runs checks.json
```
