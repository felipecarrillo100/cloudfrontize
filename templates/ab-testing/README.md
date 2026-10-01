# A/B testing

Splits visitors between two versions of the home page. Each visitor is assigned a variant once, in a cookie, and keeps seeing it for 30 days.

## How it works

`functions/cloudfront/viewer-request.ab-test.js` (a **CloudFront Function**, runtime 2.0, on **viewer-request**):

1. A visitor to `/` without the `experiment-home` cookie gets a `302` back to the same URL, with the cookie set to `a` or `b` (half each). Generated responses can set cookies; requests can't, which is why the assignment takes one redirect.
2. With the cookie, the home page is served from `/experiments/home-a.html` or `/experiments/home-b.html`. The URL stays `/`.

Change `IN_EXPERIMENT` and the two pages to test something else.

## In AWS

Add the `experiment-home` cookie to the **cache key** (cache policy), or CloudFront would cache one variant and serve it to everyone.

## Try it

```bash
cloudfrontize --webui        # open http://localhost:3000/ in two browsers
curl -i http://localhost:3000/
curl -s --cookie experiment-home=b http://localhost:3000/
cloudfrontize check
```
