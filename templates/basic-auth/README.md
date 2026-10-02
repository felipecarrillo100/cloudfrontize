# Basic auth

Protects `/admin/*` with HTTP Basic authentication, at the edge: requests without valid credentials get `401` and never reach the origin. The rest of the site is public.

## How it works

- `cloudfrontize.json` has a **cache behavior** for `/admin/*`, with the function on its **viewer-request** event. The default behavior (everything else) has no function.
- `functions/cloudfront/viewer-request.basic-auth.js` (a **CloudFront Function**) compares the `Authorization` header with the expected value and otherwise answers `401` with `WWW-Authenticate`, which makes browsers show a login prompt.

Demo credentials: **admin / change-me**.

## Before you deploy

- Don't keep credentials in the code. Store them in a **CloudFront KeyValueStore** (hashed, and read with `cf.kvs()`), or protect the area with a real identity provider (Cognito, an OIDC proxy) instead.
- Basic auth sends credentials with every request: serve the site over HTTPS only.

## Try it

```bash
cloudfrontize --webui        # http://localhost:3000/admin/index.html
curl -i -u admin:change-me http://localhost:3000/admin/index.html
cloudfrontize check
```
