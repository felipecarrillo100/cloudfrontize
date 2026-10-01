# Security headers

Adds the recommended security headers to every response: `Strict-Transport-Security`, `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` and `Permissions-Policy`.

## How it works

`functions/cloudfront/viewer-response.security-headers.js` is a **CloudFront Function** on **viewer-response**, so it runs on every response the viewer gets, including those served from the cache. Edit `HEADERS` to change them; the Content-Security-Policy usually needs your site's own sources.

> AWS doesn't run viewer-response functions when the origin returns 400 or more, so error pages don't get these headers. CloudFrontize does the same.

## Another way: response headers policies

CloudFront can also add these headers without code, with a *response headers policy* (the managed `SecurityHeadersPolicy`, or your own). A function is the way to go when the headers depend on the request or the content.

## Try it

```bash
cloudfrontize --webui        # look at the response headers in Traffic
cloudfrontize check
```
