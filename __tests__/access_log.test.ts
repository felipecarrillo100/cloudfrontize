export {};
const http = require('http');
const { createServer } = require('../src/server/createServer');
const { makeProject, removeProject, baseManifest, WWW } = require('./helpers/projectFixture');

// The terminal's request log: what the viewer asked for, then where the origin fetch went
describe('request log', () => {
    test('shows the viewer\'s path, and the origin file as a file:/// URL', async () => {
        const dir = makeProject(baseManifest({
            functions: { lang: { type: 'lambda-edge', file: 'functions/lang.js' } },
            defaultBehavior: { origin: 'web', functions: { 'origin-request': 'lang' } },
        }), {
            ...WWW,
            'origins/www/fr/index.html': 'bonjour',
            'functions/lang.js': "exports.handler = async (e) => { const r = e.Records[0].cf.request; r.uri = '/fr/index.html'; return r; };\n",
        });
        const lines: string[] = [];
        const log = jest.spyOn(console, 'log').mockImplementation((...args: any[]) => { lines.push(args.join(' ')); });
        const server = await createServer({ project: dir, port: 0 });
        try {
            await new Promise<void>(resolve => http.get(`http://127.0.0.1:${server.address().port}/welcome`, (r: any) => { r.resume(); r.on('end', () => resolve()); }));
            const plain = lines.map(l => l.replace(/\x1b\[[0-9;]*m/g, ''));
            expect(plain.some(l => /GET \/welcome ⟹ 200/.test(l))).toBe(true);
            expect(plain.some(l => l.includes('GET /fr/index.html'))).toBe(false);
            const origin = plain.find(l => l.includes('[Origin]'))!;
            expect(origin).toMatch(/file:\/\/\/.*\/origins\/www\/fr\/index\.html/);
        } finally {
            await server.closeGracefully();
            log.mockRestore();
            removeProject(dir);
        }
    });
});
