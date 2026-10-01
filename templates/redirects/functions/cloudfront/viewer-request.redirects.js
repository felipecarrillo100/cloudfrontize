// Redirects from a key value store (CloudFront Function, runtime 2.0, viewer-request).
// kvs/redirects.json maps a path to { "location": "...", "status": 301 | 302 }. Edit it to add or
// change redirects: the code doesn't change.
import cf from 'cloudfront';

// The key value store associated with this function in cloudfrontize.json ("keyValueStore")
const kvs = cf.kvs();

/** @param {CloudFrontFunctionEvent} event (types for the WebUI editor; ignored by CloudFront) */
async function handler(event) {
    const request = event.request;
    const path = request.uri.toLowerCase();

    // Paths that aren't in the store go to the origin as usual
    if (!(await kvs.exists(path))) {
        return request;
    }

    const target = await kvs.get(path, { format: 'json' });
    return {
        statusCode: target.status,
        statusDescription: target.status === 301 ? 'Moved Permanently' : 'Found',
        headers: {
            location: { value: target.location },
            'cache-control': { value: target.status === 301 ? 'max-age=3600' : 'no-store' },
        },
    };
}
