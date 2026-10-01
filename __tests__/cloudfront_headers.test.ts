export {};
const request = require('supertest');
const { createServer } = require('../src/server/createServer');
const { makeProject, removeProject, baseManifest, WWW } = require('./helpers/projectFixture');

/**
 * CloudFront-added headers (geolocation, device type...) are visible only where AWS exposes them.
 *
 * - "CloudFront adds the headers after the viewer request event, which means the headers aren't
 *   available to Lambda@Edge functions in a viewer request. The headers are only available to
 *   Lambda@Edge functions in an origin request and origin response."
 * - "Viewer-facing functions see the header value from the viewer request, while origin-facing
 *   functions see the header value that CloudFront added."
 * - CloudFront Functions: "Access to geolocation and device data: Yes".
 *   (Restrictions on Lambda@Edge › CloudFront headers; Differences between CloudFront Functions and Lambda@Edge)
 *
 * The viewer simulation file plays the role of CloudFront: it sets CloudFront-Viewer-Country and
 * CloudFront-Is-Mobile-Viewer (CloudFront-added) and X-Simulated (an ordinary viewer header).
 */
const SIMULATION = { 'CloudFront-Viewer-Country': 'BE', 'CloudFront-Is-Mobile-Viewer': 'true', 'X-Simulated': 'sim' };

// What a function saw, as "country|mobile|x-simulated"
const LAE_SEEN = `const seen = (h) => ['cloudfront-viewer-country', 'cloudfront-is-mobile-viewer', 'x-simulated']
    .map(k => h[k] ? h[k][0].value : '-').join('|');`;
const CFF_SEEN = `const seen = (h) => ['cloudfront-viewer-country', 'cloudfront-is-mobile-viewer', 'x-simulated']
    .map(k => h[k] ? h[k].value : '-').join('|');`;

const laeRequest = (event: string) => `exports.hookType = '${event}';
${LAE_SEEN}
exports.handler = async (e) => ({ status: '200', headers: { 'x-seen': [{ key: 'X-Seen', value: seen(e.Records[0].cf.request.headers) }] }, body: 'generated' });`;
const laeResponse = (event: string) => `exports.hookType = '${event}';
${LAE_SEEN}
exports.handler = async (e) => {
    const { request, response } = e.Records[0].cf;
    response.headers['x-seen'] = [{ key: 'X-Seen', value: seen(request.headers) }];
    return response;
};`;
const CFF_VIEWER_REQUEST = `${CFF_SEEN}
async function handler(event) {
    return { statusCode: 200, statusDescription: 'OK', headers: { 'x-seen': { value: seen(event.request.headers) } } };
}`;
const CFF_VIEWER_RESPONSE = `${CFF_SEEN}
async function handler(event) {
    event.response.headers['x-seen'] = { value: seen(event.request.headers) };
    return event.response;
}`;
// A CloudFront Function on viewer-request in front of a Lambda@Edge origin-request function (allowed)
const CFF_PASS = `async function handler(event) {
    event.request.headers['x-cff-ran'] = { value: 'yes' };
    return event.request;
}`;

// Response events can read the query string but not change it
const LAE_QS = (event: string) => `exports.hookType = '${event}';
exports.handler = async (e) => {
    const { request, response } = e.Records[0].cf;
    request.querystring = 'injected=1';
    return response;
};`;
const CFF_QS = `async function handler(event) {
    event.request.querystring['injected'] = { value: '1' };
    return event.response;
}`;

const pages = Object.fromEntries(
    ['lae-vr', 'lae-or', 'lae-ores', 'lae-vres', 'cff-vr', 'cff-vres', 'mixed', 'qs-ores', 'qs-vres', 'qs-cff']
        .map(p => [`origins/www/${p}/index.html`, p])
);

const files = {
    ...WWW,
    ...pages,
    'viewer-headers.json': JSON.stringify(SIMULATION),
    'functions/lae-vr.js': laeRequest('viewer-request'),
    'functions/lae-or.js': laeRequest('origin-request'),
    'functions/lae-ores.js': laeResponse('origin-response'),
    'functions/lae-vres.js': laeResponse('viewer-response'),
    'functions/cff-vr.js': CFF_VIEWER_REQUEST,
    'functions/cff-vres.js': CFF_VIEWER_RESPONSE,
    'functions/cff-pass.js': CFF_PASS,
    'functions/qs-ores.js': LAE_QS('origin-response'),
    'functions/qs-vres.js': LAE_QS('viewer-response'),
    'functions/qs-cff.js': CFF_QS
};

const manifest = (strict: boolean) => baseManifest({
    distribution: { strict },
    viewer: { headers: 'viewer-headers.json' },
    functions: {
        'lae-vr': { type: 'lambda-edge', file: 'functions/lae-vr.js' },
        'lae-or': { type: 'lambda-edge', file: 'functions/lae-or.js' },
        'lae-ores': { type: 'lambda-edge', file: 'functions/lae-ores.js' },
        'lae-vres': { type: 'lambda-edge', file: 'functions/lae-vres.js' },
        'cff-vr': { type: 'cloudfront-function', file: 'functions/cff-vr.js' },
        'cff-vres': { type: 'cloudfront-function', file: 'functions/cff-vres.js' },
        'cff-pass': { type: 'cloudfront-function', file: 'functions/cff-pass.js' },
        'qs-ores': { type: 'lambda-edge', file: 'functions/qs-ores.js' },
        'qs-vres': { type: 'lambda-edge', file: 'functions/qs-vres.js' },
        'qs-cff': { type: 'cloudfront-function', file: 'functions/qs-cff.js' }
    },
    behaviors: [
        { pathPattern: '/lae-vr/*', origin: 'web', functions: { 'viewer-request': 'lae-vr' } },
        { pathPattern: '/lae-or/*', origin: 'web', functions: { 'origin-request': 'lae-or' } },
        { pathPattern: '/lae-ores/*', origin: 'web', functions: { 'origin-response': 'lae-ores' } },
        { pathPattern: '/lae-vres/*', origin: 'web', functions: { 'viewer-response': 'lae-vres' } },
        { pathPattern: '/cff-vr/*', origin: 'web', functions: { 'viewer-request': 'cff-vr' } },
        { pathPattern: '/cff-vres/*', origin: 'web', functions: { 'viewer-response': 'cff-vres' } },
        { pathPattern: '/mixed/*', origin: 'web', functions: { 'viewer-request': 'cff-pass', 'origin-request': 'lae-or' } },
        { pathPattern: '/qs-ores/*', origin: 'web', functions: { 'origin-response': 'qs-ores' } },
        { pathPattern: '/qs-vres/*', origin: 'web', functions: { 'viewer-response': 'qs-vres' } },
        { pathPattern: '/qs-cff/*', origin: 'web', functions: { 'viewer-response': 'qs-cff' } }
    ]
});

describe('CloudFront-added headers', () => {
    let dir: string;
    let server: any;
    let warnSpy: any;

    beforeAll(async () => {
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        dir = makeProject(manifest(false), files);
        server = await createServer({ project: dir, port: 0, noBanner: true });
    });

    afterAll(async () => {
        await server.closeGracefully();
        removeProject(dir);
        jest.restoreAllMocks();
    });

    // [path, what the function sees when CloudFront adds the headers]
    const SIMULATED: [string, string][] = [
        ['/lae-vr/', '-|-|sim'],     // L@E viewer request: before CloudFront adds them
        ['/lae-or/', 'BE|true|sim'], // L@E origin request
        ['/lae-ores/', 'BE|true|sim'], // L@E origin response
        ['/lae-vres/', '-|-|sim'],   // L@E viewer response: viewer-facing
        ['/cff-vr/', 'BE|true|sim'], // CloudFront Functions have geolocation and device data
        ['/cff-vres/', 'BE|true|sim'],
        ['/mixed/', 'BE|true|sim']   // CFF viewer request + L@E origin request: the origin side sees them
    ];
    test.each(SIMULATED)('%s sees %s', async (urlPath, expected) => {
        const res = await request(server).get(`${urlPath}index.html`);
        expect(res.status).toBe(200);
        expect(res.headers['x-seen']).toBe(expected);
    });

    // When the viewer sends a header with the same name, CloudFront overwrites it for origin-facing functions
    const CLIENT_SENT: [string, string][] = [
        ['/lae-vr/', 'MX|-|sim'],
        ['/lae-or/', 'BE|true|sim'],
        ['/lae-ores/', 'BE|true|sim'],
        ['/lae-vres/', 'MX|-|sim'],
        ['/cff-vr/', 'BE|true|sim'],
        ['/cff-vres/', 'BE|true|sim']
    ];
    test.each(CLIENT_SENT)('viewer sends CloudFront-Viewer-Country: MX → %s sees %s', async (urlPath, expected) => {
        const res = await request(server).get(`${urlPath}index.html`).set('CloudFront-Viewer-Country', 'MX');
        expect(res.headers['x-seen']).toBe(expected);
    });

    test('a CloudFront header the viewer sent reaches viewer-facing functions', async () => {
        const res = await request(server).get('/lae-vr/index.html').set('CloudFront-Is-Mobile-Viewer', 'false');
        expect(res.headers['x-seen']).toBe('-|false|sim');
    });

    test.each([
        ['/qs-ores/', 'origin-response'],
        ['/qs-vres/', 'viewer-response'],
        ['/qs-cff/', 'viewer-response']
    ])('%s: changing the query string in a %s function warns and is ignored', async (urlPath, event) => {
        warnSpy.mockClear();
        const res = await request(server).get(`${urlPath}index.html?page=1`);
        expect(res.status).toBe(200);
        const warnings = warnSpy.mock.calls.map((c: any[]) => String(c[0])).join('\n');
        expect(warnings).toContain(`${event} functions can't change the query string`);
    });
});

describe('CloudFront-added headers: strict mode', () => {
    let dir: string;
    let server: any;

    beforeAll(async () => {
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
        dir = makeProject(manifest(true), files);
        server = await createServer({ project: dir, port: 0, noBanner: true });
    });

    afterAll(async () => {
        await server.closeGracefully();
        removeProject(dir);
        jest.restoreAllMocks();
    });

    test.each([
        ['/qs-ores/', 'LambdaValidationError'],
        ['/qs-vres/', 'LambdaValidationError'],
        ['/qs-cff/', 'FunctionValidationError']
    ])('%s: changing the query string in a response event is a 502 %s', async (urlPath, code) => {
        const res = await request(server).get(`${urlPath}index.html?page=1`);
        expect(res.status).toBe(502);
        expect(res.text).toContain(code);
    });

    test('reading CloudFront-added headers is never a violation', async () => {
        const res = await request(server).get('/lae-or/index.html');
        expect(res.status).toBe(200);
        expect(res.headers['x-seen']).toBe('BE|true|sim');
    });
});
