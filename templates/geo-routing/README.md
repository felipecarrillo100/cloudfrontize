# Geo routing

Each visitor gets their language's version of the site, chosen from the country CloudFront detects: France and Belgium get `/fr/`, Germany and Austria `/de/`, Spain, Mexico and Argentina `/es/`, everyone else `/en/`. The URL in the browser doesn't change.

## How it works

`functions/lambda-edge/origin-request.geo-router.js` is a **Lambda@Edge** function on **origin-request**. It reads `CloudFront-Viewer-Country` and rewrites the URI to the right folder of the origin.

Why origin-request: CloudFront adds `CloudFront-Viewer-Country` *after* the viewer request event, so a Lambda@Edge viewer-request function doesn't see it. Origin functions always get CloudFront's value, even if the viewer sends its own header, so the routing can't be faked.

In AWS, ask for the header in an **origin request policy**, and add it to the **cache key** (cache policy): otherwise the first visitor's language is cached for everyone.

## Simulating a country

`config/headers.json` plays the role of CloudFront: here, every visitor is in France. Change it (or use the **Viewer** inspector's location presets) to be somewhere else.

## Try it

```bash
cloudfrontize --webui
cloudfrontize check
```
