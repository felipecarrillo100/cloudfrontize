# 3.3 The Inspector

## 🎭 The Scenario
A bot keeps sending SQL injection attempts to your search form. You want to stop them at the edge, before they cost your origin anything.

## 📖 The Lesson: Inspecting the Request Body

Most edge functions look at headers and URIs; this one reads the **body** of `POST` and `PUT` requests.

- **"Include body"**: CloudFront only gives the body to a Lambda@Edge function when this option is enabled on the function's association. CloudFrontize always includes it.
- **Base64**: the body arrives in `request.body.data`, base64-encoded (it can be binary): decode it with `Buffer.from(data, 'base64').toString('utf8')`.
- **Truncation**: on viewer-request, CloudFront passes at most the first **40 KB** of the body (1 MB on origin-request) and sets `request.body.inputTruncated`. A long payload could hide an attack after the cut.

Returning a `403` response from viewer-request stops the request at the edge, like in [3.2 The Architect](../3.2-architect/README.md).

> [!TIP]
> The body object is described in the [Lambda@Edge Event Structure Guide](../../../commons/lambda-at-edge-event.md).

## 🗂️ This Project

| Path | What it is |
|---|---|
| `functions/lambda-edge/viewer-request.inspector.js` | The Inspector (the solution), on **viewer-request** |
| `origins/www/index.html` | A page with a search form |
| `checks.json` | What this tutorial must do, checked automatically (with POST bodies) |

## 🎯 Your Goal
Return `403` when the body matches an injection pattern (`' OR '1'='1`, `DROP TABLE`, `UNION SELECT`), and let everything else through. To practice, replace the Inspector with:

```javascript
'use strict';

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    // TODO: decode request.body.data (base64) and block suspicious content
    return request;
};
```

## 🛠️ Run It
From this folder:
```bash
cloudfrontize validate     # checks the project against AWS rules
cloudfrontize --webui      # serves it on http://localhost:3000, with the workbench on http://localhost:3001
cloudfrontize check        # runs checks.json: does it do what this article says?
```

## 🧪 How to Test
```bash
curl -i -X POST --data "q=red shoes" http://localhost:3000/index.html          # 200
curl -i -X POST --data "q=x' OR '1'='1" http://localhost:3000/index.html       # 403
```
In the workbench, send POST requests from the **Viewer** inspector's *Test request*; in **Traffic**, the **Body** tab of each step shows the decoded body.

## 💡 Fidelity Tips
- **Use AWS WAF for real protection.** Pattern lists like this one are easy to evade; AWS WAF's managed rules handle encodings, normalization and thousands of signatures. Edge functions are good for application-specific checks.
- **Check `inputTruncated`.** If the body was cut, decide whether to reject the request or let it through.

## 🎓 Learning More
- **AWS**: [Accessing the request body by choosing the include body option](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-include-body-access.html)
- **AWS**: [Restrictions on the request body](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-at-edge-function-restrictions.html#lambda-at-edge-restrictions-request-body)
