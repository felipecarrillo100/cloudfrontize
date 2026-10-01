'use strict';

/**
 * 3.2 The Architect (Lambda@Edge, viewer-request)
 * Maintenance mode: every request gets a 503 page generated at the edge. The cache and the origin
 * are never involved.
 */
const PAGE = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Down for maintenance</title>
<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;text-align:center}</style></head>
<body><h1>We'll be back shortly</h1><p>We're upgrading our systems. Thanks for your patience.</p></body>
</html>`;

exports.handler = async () => ({
    // 503 tells browsers and search engines that this is temporary; Retry-After says when to come back
    status: '503',
    statusDescription: 'Service Unavailable',
    headers: {
        'content-type': [{ key: 'Content-Type', value: 'text/html; charset=utf-8' }],
        'retry-after': [{ key: 'Retry-After', value: '3600' }],
        'cache-control': [{ key: 'Cache-Control', value: 'no-store' }],
    },
    body: PAGE,
});
