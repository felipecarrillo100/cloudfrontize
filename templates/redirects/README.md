# Redirects

Short links and moved pages, managed as data: `kvs/redirects.json` is a **CloudFront KeyValueStore**, and a **CloudFront Function** answers the matching paths with a redirect. Adding a redirect is an edit to the store, not a code change.

## How it works

- `kvs/redirects.json` is in the format AWS imports: `{ "data": [ { "key": "/summer", "value": "{...}" } ] }`. Each value is `{ "location", "status" }`, with status 301 (permanent, cached for an hour) or 302 (temporary, not cached).
- `functions/cloudfront/viewer-request.redirects.js` (runtime 2.0) looks the lower-cased path up with `cf.kvs()` and returns the redirect; other paths go to the origin.

Keys are limited to 512 characters, values to 1,024, and a store to 5 MB. `cloudfrontize validate` checks them.

## Try it

```bash
cloudfrontize --webui        # edit the store from "Key value stores"; it's reloaded when saved
curl -I http://localhost:3000/summer
cloudfrontize check
```
