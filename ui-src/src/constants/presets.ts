export const GEO_PRESETS: Record<string, any[]> = {
  'USA': [
    { key: 'CloudFront-Viewer-Country', value: 'US' },
    { key: 'CloudFront-Viewer-Region', value: 'us-east-1' }
  ],
  'MX': [
    { key: 'CloudFront-Viewer-Country', value: 'MX' },
    { key: 'CloudFront-Viewer-Region', value: 'na-south' }
  ],
  'ES': [
    { key: 'CloudFront-Viewer-Country', value: 'ES' },
    { key: 'CloudFront-Viewer-Region', value: 'eu-west-1' }
  ],
  'DE': [
    { key: 'CloudFront-Viewer-Country', value: 'DE' },
    { key: 'CloudFront-Viewer-Region', value: 'eu-central-1' }
  ],
  'FR': [
    { key: 'CloudFront-Viewer-Country', value: 'FR' },
    { key: 'CloudFront-Viewer-Region', value: 'eu-west-3' }
  ],
  'JP': [
    { key: 'CloudFront-Viewer-Country', value: 'JP' },
    { key: 'CloudFront-Viewer-Region', value: 'ap-northeast-1' }
  ]
};

export const DEVICE_PRESETS: Record<string, any[]> = {
  'Mobile': [
    { key: 'CloudFront-Is-Mobile-Viewer', value: 'true' },
    { key: 'CloudFront-Is-Tablet-Viewer', value: 'false' },
    { key: 'CloudFront-Is-Desktop-Viewer', value: 'false' },
    { key: 'CloudFront-Is-SmartTV-Viewer', value: 'false' },
  ],
  'Tablet': [
    { key: 'CloudFront-Is-Mobile-Viewer', value: 'false' },
    { key: 'CloudFront-Is-Tablet-Viewer', value: 'true' },
    { key: 'CloudFront-Is-Desktop-Viewer', value: 'false' },
    { key: 'CloudFront-Is-SmartTV-Viewer', value: 'false' },
  ],
  'Desktop': [
    { key: 'CloudFront-Is-Mobile-Viewer', value: 'false' },
    { key: 'CloudFront-Is-Tablet-Viewer', value: 'false' },
    { key: 'CloudFront-Is-Desktop-Viewer', value: 'true' },
    { key: 'CloudFront-Is-SmartTV-Viewer', value: 'false' },
  ],
  'SmartTV': [
    { key: 'CloudFront-Is-Mobile-Viewer', value: 'false' },
    { key: 'CloudFront-Is-Tablet-Viewer', value: 'false' },
    { key: 'CloudFront-Is-Desktop-Viewer', value: 'false' },
    { key: 'CloudFront-Is-SmartTV-Viewer', value: 'true' },
  ]
};

export const ORIGIN_PRESETS: Record<string, any[]> = {
  'S3 Cache': [
    { key: 'Cache-Control', value: 'public, max-age=31536000, immutable', target: 'response' },
    { key: 'ETag', value: 'W/"67a343-..." ', target: 'response' }
  ],
  'Strict HSTS': [
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload', target: 'response' }
  ],
  'CORS Allow': [
    { key: 'Access-Control-Allow-Origin', value: '*', target: 'response' },
    { key: 'Access-Control-Allow-Methods', value: 'GET, HEAD, OPTIONS', target: 'response' }
  ]
};
