# Exercise 3.2: The Architect

## 🎭 The Scenario
You are performing a massive database migration. You want to show a friendly "Maintenance" page to all users without having to stop your servers or change DNS.

## 📖 The Lesson: Global Maintenance Mode

Generating a static response from the Edge is the ultimate "safety switch" for any web application. It allows you to intercept traffic globally and serve a consistent message.

### Static Response Generation
In Lambda@Edge, you can construct a full HTTP response—including status code, headers, and a body—entirely in code. This is useful for:
- **Maintenance Windows**: Show a branded "We'll be back soon" page.
- **Custom Error Pages**: Handle 404s or 500s with a consistent look across all origins.
- **Micro-frontends**: Serve small pieces of content (like a common footer) directly from the Edge.

### Body Limits
Keep in mind that responses generated at the edge have size limits (usually 1MB for the body). For a maintenance page, this is more than enough for a beautiful, self-contained HTML/CSS file.

> [!TIP]
> **Technical Reference**: For a detailed breakdown of the Lambda@Edge event JSON and the specific fields required to generate a response, see the [Lambda@Edge Event Structure Guide](../../commons/lambda-at-edge-event.md).

## 🎯 Your Goal
Intercept every single request and return a 503 status code with a custom HTML body.

## 📝 Starter Code Template
```javascript
'use strict';

exports.hookType = 'viewer-request';

exports.handler = async (event) => {
    // TODO: Return a custom 503 response
    /*
    return {
        status: '503',
        statusDescription: 'Service Unavailable',
        body: '...'
    };
    */
};
```

## 🛠️ Instructions
1. Open `tutorial/module-3-edge/exercise-2/index.js`.
2. Return a custom response object.
3. Run the emulator:
   ```bash
   cloudfrontize www --edge ./tutorial/module-3-edge/exercise-2/index.js
   ```
4. Visit any URL on `http://localhost:3000`.
5. You should see your custom HTML page.

## 💡 Fidelity Tip
When you return a response from `viewer-request`, the request **never** reaches your origin. This is perfect for maintenance modes or custom error pages that need to be globally consistent.

## 🎓 Learning More
- **AWS Reference**: [Generating a Static Response (AWS Docs)](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-examples.html#lambda-examples-generated-response-static)
- **Keywords**: `viewer-request static response`, `Edge Maintenance Page`, `Custom HTML from Lambda@Edge`.
