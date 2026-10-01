export {};
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createServer } = require('../src/server/createServer');
const { loadProject } = require('../src/project/loadProject');
const { ChecksSchema } = require('../src/project/checks');

/**
 * Tutorial runner: every tutorial/v3/**\/checks.json is a tutorial project. Each one is validated,
 * served, and its checks run as one test each. Add a tutorial = add a folder; no test code needed.
 */
const TUTORIALS_ROOT = path.resolve(__dirname, '..', 'tutorial', 'v3');

const findTutorials = (dir: string): string[] => {
    if (!fs.existsSync(dir)) return [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const here = entries.some((e: any) => e.isFile() && e.name === 'checks.json') ? [dir] : [];
    return here.concat(...entries.filter((e: any) => e.isDirectory()).map((e: any) => findTutorials(path.join(dir, e.name))));
};

const asList = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const tutorials = findTutorials(TUTORIALS_ROOT).sort();

describe('Tutorials (v3 projects)', () => {
    test('at least one tutorial is discovered', () => {
        expect(tutorials.length).toBeGreaterThan(0);
    });

    for (const dir of tutorials) {
        const label = path.relative(TUTORIALS_ROOT, dir);
        const checks = ChecksSchema.parse(JSON.parse(fs.readFileSync(path.join(dir, 'checks.json'), 'utf8'))).checks;

        describe(label, () => {
            let server: any;

            beforeAll(async () => {
                jest.spyOn(console, 'log').mockImplementation(() => {});
                jest.spyOn(console, 'warn').mockImplementation(() => {});
                server = await createServer({ project: dir, port: 0, noBanner: true });
            });

            afterAll(async () => {
                if (server) await server.closeGracefully();
                jest.restoreAllMocks();
            });

            test('the project is valid (cloudfrontize validate)', () => {
                expect(() => loadProject(dir)).not.toThrow();
            });

            for (const check of checks) {
                test(check.name, async () => {
                    const { method, path: urlPath, headers, body } = check.request;
                    let req = request(server)[method.toLowerCase()](urlPath);
                    for (const [k, v] of Object.entries(headers)) req = req.set(k, v);
                    const res = body !== undefined ? await req.send(body) : await req;

                    const { expect: want } = check;
                    if (want.status !== undefined) expect(res.status).toBe(want.status);
                    for (const [k, v] of Object.entries(want.headers || {})) expect(res.headers[k.toLowerCase()]).toBe(v);
                    for (const [k, v] of Object.entries(want.headersContain || {})) expect(String(res.headers[k.toLowerCase()] ?? '')).toContain(v);
                    for (const k of want.headersAbsent || []) expect(res.headers[k.toLowerCase()]).toBeUndefined();
                    for (const text of asList(want.bodyContains)) expect(res.text).toContain(text);
                    for (const text of asList(want.bodyNotContains)) expect(res.text).not.toContain(text);
                });
            }
        });
    }
});
