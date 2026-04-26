# CloudFront Functions (CFF) Event Structure

CloudFront Functions (CFF) have a much simpler event structure than Lambda@Edge. CFF is designed for high performance and low latency, so the event object is stripped down to the essentials.

## Event Structure
Unlike Lambda@Edge, the CFF event is a direct object (no `Records` array).

```javascript
{
  "version": "1.0",
  "context": {
    "eventType": "viewer-request", // or viewer-response
    "requestId": "a4e1cab2...",
    "distributionId": "EDFDVBD6EXAMPLE"
  },
  "viewer": {
    "ip": "192.168.1.1"
  },
  "request": {
    "method": "GET",
    "uri": "/index.html",
    "querystring": {
      "id": { "value": "123" },
      "sort": { "value": "desc", "multiValue": [...] }
    },
    "headers": {
      "host": { "value": "example.com" },
      "user-agent": { "value": "curl/7.64.1" }
    },
    "cookies": {
      "id": { "value": "123" }
    }
  },
  "response": {
    "statusCode": 200,
    "statusDescription": "OK",
    "headers": {
      "content-type": { "value": "text/html" }
    },
    "cookies": { ... }
  }
}
```

## Key Differences from Lambda@Edge

| Feature | CloudFront Functions | Lambda@Edge |
| :--- | :--- | :--- |
| **Structure** | Flat object | Nested `Records[0].cf` |
| **Headers** | Object with `{ value: "..." }` | Array of `{ key: "...", value: "..." }` |
| **Query String** | Parsed object | Raw string |
| **Cookies** | Native `cookies` object | Must parse from `Cookie` header |
| **Status Code** | Number (`200`) | String (`"200"`) |

## Header Handling in CFF
In CFF, headers are simpler but still case-insensitive for keys.

```javascript
// To access a header
const host = event.request.headers['host'].value;

// To set a header
event.request.headers['x-custom-header'] = { value: 'my-value' };
```
