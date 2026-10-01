export {};
const request = require('supertest');
const { startServer } = require('../src/index');
const { EdgeRunner } = require('../src/edgeRunner');
const fs = require('fs');
const path = require('path');

describe('Default Header Injection (--headers)', () => {
    const tmpDir = path.join(__dirname, '.tmp/', 'header_test');
    const edgeDir = path.join(tmpDir, 'edge');
    const port = 3008;

    let server;
    let edgeRunner;

    beforeAll(() => {
        if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
        fs.mkdirSync(tmpDir, { recursive: true });
        fs.mkdirSync(edgeDir, { recursive: true });

        // AWS: "CloudFront adds the headers after the viewer request event, which means the headers aren't
        // available to Lambda@Edge functions in a viewer request. The headers are only available to
        // Lambda@Edge functions in an origin request and origin response."
        // The viewer hook records what it saw; the origin-request hook answers with both views.
        fs.writeFileSync(path.join(edgeDir, 'viewer.js'), `
            exports.hookType = 'viewer-request';
            exports.handler = async (event) => {
                const req = event.Records[0].cf.request;
                const country = req.headers['cloudfront-viewer-country'] ? req.headers['cloudfront-viewer-country'][0].value : 'NONE';
                const custom = req.headers['x-custom-header'] ? req.headers['x-custom-header'][0].value : 'NONE';
                req.headers['x-viewer-saw'] = [{ key: 'X-Viewer-Saw', value: country + ',' + custom }];
                return req;
            };
        `);
        fs.writeFileSync(path.join(edgeDir, 'origin.js'), `
            exports.hookType = 'origin-request';
            exports.handler = async (event) => {
                const req = event.Records[0].cf.request;
                const country = req.headers['cloudfront-viewer-country'] ? req.headers['cloudfront-viewer-country'][0].value : 'NONE';
                return {
                    status: '200',
                    statusDescription: 'OK',
                    headers: {
                        'x-echoed-country': [{ key: 'X-Echoed-Country', value: country }],
                        'x-viewer-saw': req.headers['x-viewer-saw']
                    },
                    body: 'Country: ' + country
                };
            };
        `);
    });

    afterAll(() => {
        if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    afterEach(async () => {
        if (server) await server.closeGracefully();
        if (edgeRunner) edgeRunner.close();
    });

    test('Should inject default headers when missing', async () => {
        const defaultHeaders = {
            'CloudFront-Viewer-Country': 'BE',
            'X-Custom-Header': 'foo'
        };

        edgeRunner = new EdgeRunner(edgeDir, { watch: false });
edgeRunner.load();
        server = startServer({ 
            directory: tmpDir, 
            port: 0, 
            edgeRunner, 
            noBanner: true,
            defaultHeaders
        });

        const res = await request(server).get('/');
        // Viewer headers reach the viewer hook; the CloudFront-added one only the origin-facing hook
        expect(res.header['x-viewer-saw']).toBe('NONE,foo');
        expect(res.header['x-echoed-country']).toBe('BE');
        expect(res.text).toBe('Country: BE');
    });

    test('Should NOT overwrite existing headers', async () => {
        const defaultHeaders = {
            'CloudFront-Viewer-Country': 'BE'
        };

        edgeRunner = new EdgeRunner(edgeDir, { watch: false });
edgeRunner.load();
        server = startServer({ 
            directory: tmpDir, 
            port: 0, 
            edgeRunner, 
            noBanner: true,
            defaultHeaders
        });

        // Send request with an existing country header
        const res = await request(server)
            .get('/')
            .set('CloudFront-Viewer-Country', 'MX');

        // A header the viewer sent is seen by every function (2.x defaultHeaders don't overwrite it)
        expect(res.header['x-viewer-saw']).toBe('MX,NONE');
        expect(res.header['x-echoed-country']).toBe('MX');
        expect(res.text).toBe('Country: MX');
    });

    test('Should handle case-insensitivity correctly', async () => {
        const defaultHeaders = {
            'cloudfront-viewer-country': 'FR'
        };

        edgeRunner = new EdgeRunner(edgeDir, { watch: false });
edgeRunner.load();
        server = startServer({ 
            directory: tmpDir, 
            port: 0, 
            edgeRunner, 
            noBanner: true,
            defaultHeaders
        });

        const res = await request(server).get('/');
        expect(res.header['x-viewer-saw']).toBe('NONE,NONE');
        expect(res.header['x-echoed-country']).toBe('FR');
    });
});

