'use strict';

const request = require('supertest');
const { startServer } = require('../src/index');
const { EdgeRunner } = require('../src/edgeRunner');
const fs = require('fs');
const path = require('path');

describe('Lambda@Edge Tutorial Solutions Verification', () => {
    const rootDir = path.resolve(__dirname, '..');
    const solutionsDir = path.join(rootDir, 'tutorial', 'solutions');
    const baseDir = path.join(rootDir, '.tmp/', 'test', 'lae_tutorial_verification');
    const wwwDir = path.join(baseDir, 'www');
    let server;

    beforeAll(() => {
        if (fs.existsSync(baseDir)) fs.rmSync(baseDir, { recursive: true, force: true });
        fs.mkdirSync(wwwDir, { recursive: true });
        
        // Setup mock www files
        fs.writeFileSync(path.join(wwwDir, 'index.html'), '<h1>Home</h1>');
        fs.mkdirSync(path.join(wwwDir, 'countries', 'MX'), { recursive: true });
        fs.writeFileSync(path.join(wwwDir, 'countries', 'MX', 'index.html'), '<h1>Hola Mexico</h1>');
        fs.mkdirSync(path.join(wwwDir, 'experimental'), { recursive: true });
        fs.writeFileSync(path.join(wwwDir, 'experimental', 'index.html'), '<h1>Experimental</h1>');
        
        // Maintenance page for 3.2 (shared)
        fs.writeFileSync(path.join(wwwDir, 'maintenance.html'), '<h1>Maintenance</h1>');
    });

    afterEach(async () => {
        if (server) {
            await server.closeGracefully();
            server = null;
        }
    });

    const setupIsolatedRunner = (fileName, options = {}) => {
        const testId = fileName.replace('.js', '').replace(/\./g, '_');
        const testEdgeDir = path.join(baseDir, 'edge', testId);
        if (!fs.existsSync(testEdgeDir)) fs.mkdirSync(testEdgeDir, { recursive: true });
        
        const srcPath = path.join(solutionsDir, fileName);
        const destPath = path.join(testEdgeDir, 'index.js');
        fs.copyFileSync(srcPath, destPath);

        // Copy maintenance.html to the edge dir for 3.2
        if (fileName === '3.2-architect.js') {
            fs.copyFileSync(path.join(wwwDir, 'maintenance.html'), path.join(testEdgeDir, 'maintenance.html'));
        }

        // Add a reflector hook to verify request mutations in the final response
        const reflectHook = `
            exports.hookType = 'viewer-response';
            exports.handler = async (event) => {
                const request = event.Records[0].cf.request;
                const response = event.Records[0].cf.response || { status: '200', statusDescription: 'OK', headers: {} };
                
                for (var h in request.headers) {
                    if (h.toLowerCase().startsWith('x-')) {
                        response.headers[h] = request.headers[h];
                    }
                }
                return response;
            };
        `;
        fs.writeFileSync(path.join(testEdgeDir, 'z-reflector.js'), reflectHook);

        return new EdgeRunner(testEdgeDir, options);
    };

    // === Module 1: Foundations ===

    test('1.1-security-guard: Should inject security headers', async () => {
        server = startServer({
            port: 0,
            directory: wwwDir,
            edgeRunner: setupIsolatedRunner('1.1-security-guard.js')
        });

        const res = await request(server).get('/index.html');
        expect(res.headers['strict-transport-security']).toBe('max-age=63072000; includeSubDomains; preload');
        expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    test('1.2-librarian: Should normalize query strings', async () => {
        server = startServer({
            port: 0,
            directory: wwwDir,
            edgeRunner: setupIsolatedRunner('1.2-librarian.js')
        });

        const res = await request(server).get('/index.html?z=9&a=1');
        expect(res.status).toBe(200);
    });

    test('1.3-concierge: Should redirect mobile users', async () => {
        server = startServer({
            port: 0,
            directory: wwwDir,
            edgeRunner: setupIsolatedRunner('1.3-concierge.js')
        });

        const res = await request(server)
            .get('/index.html')
            .set('CloudFront-Is-Mobile-Viewer', 'true');
        
        expect(res.status).toBe(302);
        expect(res.headers['location']).toBe('https://m.example.com/index.html');
    });

    // === Module 2: Origin Intelligence ===

    test('2.1-scientist: Should rewrite for experiment cookie', async () => {
        server = startServer({
            port: 0,
            directory: wwwDir,
            edgeRunner: setupIsolatedRunner('2.1-scientist.js')
        });

        const res = await request(server)
            .get('/')
            .set('Cookie', 'experiment=true');
        
        expect(res.text).toContain('Experimental');
    });

    test('2.2-diplomat: Should prepend country code', async () => {
        server = startServer({
            port: 0,
            directory: wwwDir,
            edgeRunner: setupIsolatedRunner('2.2-diplomat.js')
        });

        const res = await request(server)
            .get('/index.html')
            .set('CloudFront-Viewer-Country', 'MX');
        
        expect(res.text).toContain('Hola Mexico');
    });

    test('2.3-cloaker: Should strip origin server headers', async () => {
        const testId = '2.3-cloaker';
        const headersPath = path.join(baseDir, 'edge', testId, 'headers.json');
        const edgeDir = path.join(baseDir, 'edge', testId);
        if (!fs.existsSync(edgeDir)) fs.mkdirSync(edgeDir, { recursive: true });

        fs.writeFileSync(headersPath, JSON.stringify({
            responseHeaders: {
                'Server': 'Apache/2.4.41',
                'X-Powered-By': 'PHP/5.6.40'
            }
        }));

        server = startServer({
            port: 0,
            directory: wwwDir,
            headers: headersPath,
            edgeRunner: setupIsolatedRunner('2.3-cloaker.js')
        });

        const res = await request(server).get('/index.html');
        expect(res.headers['server']).toBeUndefined();
        expect(res.headers['x-powered-by']).toBeUndefined();
    });

    // === Module 3: Edge Computing ===

    test('3.1-bouncer: Should gate with Basic Auth', async () => {
        server = startServer({
            port: 0,
            directory: wwwDir,
            edgeRunner: setupIsolatedRunner('3.1-bouncer.js')
        });

        const resFail = await request(server).get('/');
        expect(resFail.status).toBe(401);

        const resPass = await request(server)
            .get('/')
            .set('Authorization', 'Basic YWRtaW46cGFzc3dvcmQ=');
        expect(resPass.status).toBe(200);
    });

    test('3.2-architect: Should generate maintenance page', async () => {
        server = startServer({
            port: 0,
            directory: wwwDir,
            edgeRunner: setupIsolatedRunner('3.2-architect.js')
        });

        const res = await request(server).get('/any-path');
        expect(res.status).toBe(503);
        expect(res.text).toContain('Maintenance');
    });

    test('3.3-inspector: Should block SQL-INJECTION in body', async () => {
        server = startServer({
            port: 0,
            directory: wwwDir,
            edgeRunner: setupIsolatedRunner('3.3-inspector.js')
        });

        const res = await request(server)
            .post('/api')
            .send('id=1 OR 1=1');
        
        expect(res.status).toBe(403);
    });

    // === Module 4: Production ===

    test('4.1-baker: Should verify variable baking', async () => {
        const varsPath = path.join(solutionsDir, '4.1-baked.variables');
        
        server = startServer({
            port: 0,
            directory: wwwDir,
            edgeRunner: setupIsolatedRunner('4.1-baker.js', {
                bakePath: varsPath
            })
        });

        const res = await request(server).get('/');
        // The reflector hook copies x-baked-end-point from request to response
        expect(res.headers['x-baked-end-point']).toBe('http://localhost:9090');
    });
});
