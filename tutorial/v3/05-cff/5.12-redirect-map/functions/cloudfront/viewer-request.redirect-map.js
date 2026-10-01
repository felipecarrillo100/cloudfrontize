import cf from 'cloudfront';

// The key value store associated with this function in cloudfrontize.json ("keyValueStore")
const kvs = cf.kvs();

async function handler(event) {
    const request = event.request;
    const path = request.uri.toLowerCase();

    // Unknown paths go to the origin as usual
    if (!(await kvs.exists(path))) {
        return request;
    }

    // Each value is JSON: { "location": "...", "status": 301 | 302 }
    const target = await kvs.get(path, { format: 'json' });
    console.log(`Redirect ${path} -> ${target.location} (${target.status})`);

    return {
        statusCode: target.status,
        statusDescription: target.status === 301 ? 'Moved Permanently' : 'Found',
        headers: {
            location: { value: target.location },
            'cache-control': { value: target.status === 301 ? 'max-age=3600' : 'no-store' }
        }
    };
}
