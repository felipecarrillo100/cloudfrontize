export {};
const fs = require('fs');
const net = require('net');
const path = require('path');
const request = require('supertest');
const { createServer } = require('../src/server/createServer');
const { PortInUseError, ManifestError } = require('../src/project/errors');
const { makeProject, removeProject, baseManifest, WWW } = require('./helpers/projectFixture');

// CloudFront Function (viewer-request) adds a header; Lambda@Edge (origin-request) echoes it back.
const pipelineProject = (label: string) => makeProject(baseManifest({
    name: label,
    distribution: { port: 0 },
    functions: {
        tag: { type: 'cloudfront-function', runtime: 'cloudfront-js-1.0', file: 'functions/cloudfront/viewer-request.tag.js' },
        echo: { type: 'lambda-edge', file: 'functions/lambda-edge/origin-request.echo.js' }
    },
    defaultBehavior: { origin: 'web', functions: { 'viewer-request': 'tag', 'origin-request': 'echo' } }
}), {
    ...WWW,
    'functions/cloudfront/viewer-request.tag.js': `function handler(event) { event.request.headers['x-tag'] = { value: '${label}' }; return event.request; }`,
    'functions/lambda-edge/origin-request.echo.js': `exports.handler = async (event) => {
        const req = event.Records[0].cf.request;
        const tag = req.headers['x-tag'] ? req.headers['x-tag'][0].value : 'none';
        return { status: '200', headers: { 'content-type': [{ key: 'Content-Type', value: 'text/plain' }] }, body: 'tag=' + tag };
    };`
});

describe('Project runtime', () => {
    const dirs: string[] = [];
    let server: any;

    beforeAll(() => {
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(async () => {
        if (server) await server.closeGracefully();
        server = null;
        while (dirs.length) removeProject(dirs.pop()!);
    });

    afterAll(() => jest.restoreAllMocks());

    test('runs a project: the manifest decides which functions run at which stage', async () => {
        const dir = pipelineProject('alpha');
        dirs.push(dir);
        server = await createServer({ project: dir, noBanner: true });

        const res = await request(server).get('/index.html');
        expect(res.status).toBe(200);
        expect(res.text).toBe('tag=alpha');
    });

    test('hot-reloads a function file when it changes', async () => {
        const dir = pipelineProject('before');
        dirs.push(dir);
        server = await createServer({ project: dir, noBanner: true });
        expect((await request(server).get('/')).text).toBe('tag=before');

        const file = path.join(dir, 'functions/cloudfront/viewer-request.tag.js');
        fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace("'before'", "'after'"));

        // File watching is slower when the whole suite runs in parallel: poll for up to 15s
        let text = '';
        for (let i = 0; i < 150 && text !== 'tag=after'; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            text = (await request(server).get('/')).text;
        }
        expect(text).toBe('tag=after');
    }, 20000);

    test('switches projects without restarting, and disposes the previous one', async () => {
        const a = pipelineProject('alpha');
        const b = pipelineProject('bravo');
        dirs.push(a, b);
        server = await createServer({ project: a, noBanner: true });
        const port = server.address().port;
        const previous = server.current;
        expect((await request(server).get('/')).text).toBe('tag=alpha');

        await server.openProject(b);

        expect(server.address().port).toBe(port);
        expect(server.current.project.manifest.name).toBe('bravo');
        expect((await request(server).get('/')).text).toBe('tag=bravo');
        // The old runtime's watchers are closed
        expect(previous.edgeRunner.watcher).toBeNull();
        expect(previous.cffRunner.watcher).toBeNull();
    });

    test('an invalid project doesn\'t replace the running one', async () => {
        const a = pipelineProject('alpha');
        const broken = makeProject(baseManifest({ defaultBehavior: { origin: 'missing' } }), WWW);
        dirs.push(a, broken);
        server = await createServer({ project: a, noBanner: true });

        await expect(server.openProject(broken)).rejects.toBeInstanceOf(ManifestError);
        expect((await request(server).get('/')).text).toBe('tag=alpha');
    });

    test('a busy port rejects `ready` instead of exiting the process', async () => {
        const blocker = net.createServer();
        await new Promise(resolve => blocker.listen(0, resolve));
        const busyPort = blocker.address().port;
        const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {}) as any);
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        const dir = pipelineProject('alpha');
        dirs.push(dir);
        try {
            await expect(createServer({ project: dir, port: busyPort, noBanner: true })).rejects.toBeInstanceOf(PortInUseError);
            expect(exitSpy).not.toHaveBeenCalled();
        } finally {
            exitSpy.mockRestore();
            errorSpy.mockRestore();
            await new Promise(resolve => blocker.close(resolve));
        }
    });
});
