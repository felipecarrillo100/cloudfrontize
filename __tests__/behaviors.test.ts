export {};
const request = require('supertest');
const { createServer } = require('../src/server/createServer');
const { makeProject, removeProject, baseManifest, WWW } = require('./helpers/projectFixture');

// AWS: the cache behavior is chosen from the viewer's URI, then that behavior's own functions run.
const AUTH = `exports.handler = async (event) => {
    const req = event.Records[0].cf.request;
    if (req.headers.authorization) return req;
    return { status: '401', statusDescription: 'Unauthorized', headers: { 'www-authenticate': [{ key: 'WWW-Authenticate', value: 'Basic' }] } };
};`;
const TAG = `exports.handler = async (event) => {
    const res = event.Records[0].cf.response;
    res.headers['x-tagged'] = [{ key: 'X-Tagged', value: 'yes' }];
    return res;
};`;

const files = {
    ...WWW,
    'origins/www/admin/index.html': 'admin',
    'origins/www/a/page.html': 'a',
    'origins/www/b/page.html': 'b',
    'origins/www/c/page.html': 'c',
    'origins/www/img/ab.png': 'two-chars',
    'origins/www/img/abc.png': 'three-chars',
    'functions/auth.js': AUTH,
    'functions/tag.js': TAG,
    'functions/broken.js': 'exports.handler = async (event) => { return event.Records[0].cf.request; ' // syntax error
};

describe('Cache behaviors', () => {
    let dir: string;
    let server: any;

    beforeAll(async () => {
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
        dir = makeProject(baseManifest({
            functions: {
                auth: { type: 'lambda-edge', file: 'functions/auth.js' },
                tag: { type: 'lambda-edge', file: 'functions/tag.js' },
                broken: { type: 'lambda-edge', file: 'functions/broken.js' }
            },
            behaviors: [
                { pathPattern: '/admin/*', origin: 'web', functions: { 'viewer-request': 'auth' } },
                { pathPattern: '/a/*', origin: 'web', functions: { 'origin-response': 'tag' } },
                { pathPattern: '/b/*', origin: 'web', functions: { 'origin-response': 'tag' } },
                { pathPattern: '/img/??.png', origin: 'web', functions: { 'origin-response': 'tag' } },
                { pathPattern: '/broken/*', origin: 'web', functions: { 'viewer-request': 'broken' } }
            ]
        }), files);
        server = await createServer({ project: dir, port: 0, noBanner: true });
    });

    afterAll(async () => {
        await server.closeGracefully();
        removeProject(dir);
        jest.restoreAllMocks();
    });

    test('a function attached to /admin/* runs only for that behavior', async () => {
        expect((await request(server).get('/admin/index.html')).status).toBe(401);
        expect((await request(server).get('/admin/index.html').set('Authorization', 'Basic eDp5')).status).toBe(200);
        expect((await request(server).get('/index.html')).status).toBe(200);
    });

    test('one function can serve several behaviors', async () => {
        expect((await request(server).get('/a/page.html')).headers['x-tagged']).toBe('yes');
        expect((await request(server).get('/b/page.html')).headers['x-tagged']).toBe('yes');
        expect((await request(server).get('/c/page.html')).headers['x-tagged']).toBeUndefined();
    });

    test('`?` in a path pattern matches exactly one character', async () => {
        expect((await request(server).get('/img/ab.png')).headers['x-tagged']).toBe('yes');
        expect((await request(server).get('/img/abc.png')).headers['x-tagged']).toBeUndefined();
    });

    test('a function that fails to build only blocks the behaviors that use it', async () => {
        expect((await request(server).get('/broken/x')).status).toBe(502);
        expect((await request(server).get('/index.html')).status).toBe(200);
        expect((await request(server).get('/a/page.html')).status).toBe(200);
    });

    test('disabling a function affects every behavior that uses it', async () => {
        const orchestrator = server.current.orchestrator;
        orchestrator.toggleHook('tag', true);
        try {
            expect((await request(server).get('/a/page.html')).headers['x-tagged']).toBeUndefined();
            expect((await request(server).get('/b/page.html')).headers['x-tagged']).toBeUndefined();
        } finally {
            orchestrator.toggleHook('tag', false);
        }
        expect((await request(server).get('/a/page.html')).headers['x-tagged']).toBe('yes');
    });

    test('the distribution lists functions once and behaviors with their attachments', () => {
        const dist = server.current.orchestrator.getDistribution();
        const ids = dist.functions.map((f: any) => f.id).sort();
        expect(ids).toEqual(['auth', 'broken', 'tag']);
        const admin = dist.behaviors.find((b: any) => b.pathPattern === '/admin/*');
        expect(admin.functions).toEqual({ 'viewer-request': ['auth'] });
        expect(dist.behaviors[dist.behaviors.length - 1].key).toBe('default');
    });
});
