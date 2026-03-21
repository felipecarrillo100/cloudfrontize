'use strict';

const request = require('supertest');
const { startServer } = require('../src/index');
const { EdgeRunner } = require('../src/edgeRunner');
const { CFFRunner } = require('../src/CFFRunner');
const fs = require('fs');
const path = require('path');

describe('CFF Tutorial Solutions Verification', () => {
    const rootDir = path.resolve(__dirname, '..');
    const solutionsDir = path.join(rootDir, 'tutorial', 'module-5-cff', 'solutions');
    const baseDir = path.join(rootDir, '.tmp/', 'test', 'cff_tutorial_verification');
    const wwwDir = path.join(baseDir, 'www');
    const edgeDir = path.join(baseDir, 'edge');
    let server;
    let edgeRunner;

    beforeAll(() => {
        if (fs.existsSync(baseDir)) fs.rmSync(baseDir, { recursive: true, force: true });
        fs.mkdirSync(wwwDir, { recursive: true });
        fs.mkdirSync(edgeDir, { recursive: true });
        
        // Setup mock www files
        fs.writeFileSync(path.join(wwwDir, 'index.html'), '<h1>Home</h1>');
        fs.writeFileSync(path.join(wwwDir, 'products.html'), '<h1>Products</h1>');
        fs.writeFileSync(path.join(wwwDir, 'style.css'), 'body { color: blue; }');
        
        // Geo router content
        fs.mkdirSync(path.join(wwwDir, 'countries', 'FR'), { recursive: true });
        fs.writeFileSync(path.join(wwwDir, 'countries', 'FR', 'index.html'), '<h1>Bienvenue en France</h1>');
        fs.mkdirSync(path.join(wwwDir, 'countries', 'US'), { recursive: true });
        fs.writeFileSync(path.join(wwwDir, 'countries', 'US', 'index.html'), '<h1>Welcome to USA</h1>');
        
        // A/B test pages
        fs.writeFileSync(path.join(wwwDir, 'chocolate-cookie.html'), '<h1>Chocolate Page</h1>');
        fs.writeFileSync(path.join(wwwDir, 'vanilla-cookie.html'), '<h1>Vanilla Page</h1>');

        // Setup a diagnostic Edge hook to reflect headers for verification.
        // MUST specify exports.hookType for EdgeRunner to register it.
        const reflectHook = `
            exports.hookType = 'viewer-response';
            exports.handler = async (event) => {
                const request = event.Records[0].cf.request;
                const response = event.Records[0].cf.response || { status: '200', statusDescription: 'OK', headers: {} };
                
                // Whitelist of headers we want to reflect for automated verification
                const whitelist = [
                    'x-demo', 
                    'strict-transport-security', 
                    'x-frame-options', 
                    'content-security-policy', 
                    'referrer-policy', 
                    'x-content-type-options'
                ];
                
                for (var h in request.headers) {
                    if (whitelist.indexOf(h.toLowerCase()) !== -1) {
                        response.headers[h] = request.headers[h];
                    }
                }
                return response;
            };
        `;
        fs.writeFileSync(path.join(edgeDir, 'viewer-response-reflect.js'), reflectHook);
        edgeRunner = new EdgeRunner(edgeDir);
    });

    afterEach(async () => {
        if (server) {
            await server.closeGracefully();
            server = null;
        }
    });

    // === 🟢 BEGINNER ===

    test('Beginner Ex 1.1: Traffic Director (Redirect)', async () => {
        const solPath = path.join(solutionsDir, 'beginner', 'viewer-request-redirect.js');
        server = startServer({
            port: 0,
            directory: wwwDir,
            cffRunner: new CFFRunner(solPath)
        });

        const res = await request(server).get('/promo');
        expect(res.status).toBe(301);
        expect(res.headers['location']).toBe('/summer-sale');
    });

    test('Beginner Ex 1.2: Header Injector', async () => {
        const solPath = path.join(solutionsDir, 'beginner', 'viewer-request-header.js');
        server = startServer({
            port: 0,
            directory: wwwDir,
            cffRunner: new CFFRunner(solPath),
            edgeRunner // Use diagnostic reflection
        });

        const res = await request(server).get('/index.html');
        expect(res.headers['x-demo']).toBe('cloudfrontize');
    });

    test('Beginner Ex 1.3: Simple Blocker', async () => {
        const solPath = path.join(solutionsDir, 'beginner', 'viewer-request-blocker.js');
        server = startServer({
            port: 0,
            directory: wwwDir,
            cffRunner: new CFFRunner(solPath)
        });

        const resOk = await request(server).get('/index.html');
        expect(resOk.status).toBe(200);

        const resBlock = await request(server).get('/admin/anything');
        expect(resBlock.status).toBe(403);
    });

    // === 🟡 INTERMEDIATE ===

    test('Intermediate Ex 1.4: Query Normalizer', async () => {
        const solPath = path.join(solutionsDir, 'intermediate', 'viewer-request-query-normalizer.js');
        server = startServer({
            port: 0,
            directory: wwwDir,
            cffRunner: new CFFRunner(solPath)
        });

        const res = await request(server).get('/products.html?utm_source=google&id=123&utm_campaign=xyz');
        expect(res.status).toBe(200);
        expect(res.text).toContain('Products');
    });

    test('Intermediate Ex 2.1: Geo Router (Rewrite)', async () => {
        const solPath = path.join(solutionsDir, 'intermediate', 'viewer-request-geo-router.js');
        server = startServer({
            port: 0,
            directory: wwwDir,
            cffRunner: new CFFRunner(solPath)
        });

        const resFR = await request(server)
            .get('/index.html')
            .set('cloudfront-viewer-country', 'FR');
        expect(resFR.text).toContain('Bienvenue en France');

        const resUS = await request(server)
            .get('/index.html')
            .set('cloudfront-viewer-country', 'US');
        expect(resUS.text).toContain('Welcome to USA');

        const resCSS = await request(server)
            .get('/style.css')
            .set('cloudfront-viewer-country', 'FR');
        expect(resCSS.status).toBe(200);
        expect(resCSS.text).toContain('blue');
    });

    test('Intermediate Ex 3.1: Bot Detector', async () => {
        const solPath = path.join(solutionsDir, 'intermediate', 'viewer-request-bot-detector.js');
        server = startServer({
            port: 0,
            directory: wwwDir,
            cffRunner: new CFFRunner(solPath)
        });

        const resBot = await request(server)
            .get('/')
            .set('User-Agent', 'GPTBot');
        expect(resBot.status).toBe(403);

        const resUser = await request(server)
            .get('/')
            .set('User-Agent', 'Mozilla/5.0');
        expect(resUser.status).toBe(200);
    });

    // === 🔴 ADVANCED ===

    test('Advanced Ex 3.2: A/B Testing Router', async () => {
        const solPath = path.join(solutionsDir, 'advanced', 'viewer-request-ab-router.js');
        server = startServer({
            port: 0,
            directory: wwwDir,
            cffRunner: new CFFRunner(solPath)
        });

        const resA = await request(server)
            .get('/')
            .set('Cookie', 'ab_test_group=A');
        expect(resA.text).toContain('Chocolate Page');

        const resB = await request(server)
            .get('/')
            .set('Cookie', 'ab_test_group=B');
        expect(resB.text).toContain('Vanilla Page');

        const resNew = await request(server).get('/');
        const isOneOfPages = resNew.text.includes('Chocolate') || resNew.text.includes('Vanilla');
        expect(isOneOfPages).toBe(true);
    });

    test('Advanced Ex 3.3: Header Policy', async () => {
        const solPath = path.join(solutionsDir, 'advanced', 'viewer-request-header-policy.js');
        server = startServer({
            port: 0,
            directory: wwwDir,
            cffRunner: new CFFRunner(solPath),
            edgeRunner // Use diagnostic reflection
        });

        const res = await request(server).get('/');
        expect(res.headers['strict-transport-security']).toBeDefined();
        expect(res.headers['x-frame-options']).toBe('DENY');
    });

    test('Advanced Ex 3.4: Rate Gate', async () => {
        const solPath = path.join(solutionsDir, 'advanced', 'viewer-request-rate-gate.js');
        server = startServer({
            port: 0,
            directory: wwwDir,
            cffRunner: new CFFRunner(solPath)
        });

        const resOk = await request(server)
            .get('/')
            .set('x-request-count', '50');
        expect(resOk.status).toBe(200);

        const resLimit = await request(server)
            .get('/')
            .set('x-request-count', '101');
        expect(resLimit.status).toBe(429);
    });

    // === 🏆 PRO ===

    test('Pro: Combined Cookie Guard & Counter', async () => {
        const solPath = path.join(solutionsDir, 'pro', 'cff10');
        server = startServer({
            port: 0,
            directory: wwwDir,
            cffRunner: new CFFRunner(solPath)
        });

        let res = await request(server).get('/');
        expect(res.headers['set-cookie'][0]).toContain('client-request-count=1');
        
        res = await request(server)
            .get('/')
            .set('Cookie', 'client-request-count=1');
        expect(res.headers['set-cookie'][0]).toContain('client-request-count=2');

        res = await request(server)
            .get('/')
            .set('Cookie', 'client-request-count=5');
        expect(res.status).toBe(429);
    });
});
