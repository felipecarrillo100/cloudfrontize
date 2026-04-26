# Lambda@Edge Event Structure

Lambda@Edge functions receive an `event` object that contains information about the request or response. Because Lambda@Edge is integrated with CloudFront, the structure is slightly nested to allow for metadata like the distribution configuration.

## Top-Level Structure
The event always contains a `Records` array. For Lambda@Edge, this array always has exactly **one** record.

```javascript
{
  "Records": [
    {
      "cf": {
        "config": {
          "distributionId": "EDFDVBD6EXAMPLE",
          "requestId": "a4e1cab2...",
          "eventType": "viewer-request" // or origin-request, origin-response, viewer-response
        },
        "request": { ... },
        "response": { ... } // Only present in response hooks
      }
    }
  ]
}
```

## The Request Object
The `request` object contains the incoming HTTP request details.

| Property | Description | Example |
| :--- | :--- | :--- |
| `uri` | The request URI | `/index.html` |
| `method` | The HTTP method | `GET`, `POST` |
| `querystring` | The query string (raw) | `id=123&sort=desc` |
| `clientIp` | The IP of the viewer | `192.168.1.1` |
| `headers` | A dictionary of headers | See below |

## The Response Object
The `response` object is available in `origin-response` and `viewer-response` hooks.

| Property | Description | Example |
| :--- | :--- | :--- |
| `status` | The HTTP status code (string) | `"200"` |
| `statusDescription` | The status text | `"OK"` |
| `headers` | A dictionary of headers | See below |

## 🧠 Header "Fidelity Map"
Lambda@Edge uses a specific structure for headers to handle multiple values for the same key (like `Set-Cookie`).

1.  **Map Key**: The key in the `headers` object is **always lowercase**.
2.  **Array of Values**: Every header value is wrapped in an array.
3.  **Key-Value Pairs**: Each entry in the array has a `key` (original casing) and a `value`.

### Example:
```javascript
"headers": {
  "content-type": [
    {
      "key": "Content-Type",
      "value": "text/html"
    }
  ],
  "set-cookie": [
    { "key": "Set-Cookie", "value": "id=1" },
    { "key": "Set-Cookie", "value": "theme=dark" }
  ]
}
```
