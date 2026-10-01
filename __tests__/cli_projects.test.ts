export {};
const { exec, spawn } = require('child_process');
const http = require('http');
const net = require('net');
const path = require('path');
const { makeProject, removeProject, baseManifest, WWW } = require('./helpers/projectFixture');

const cliPath = path.resolve(__dirname, '../bin/cli.ts');
const tsxPath = path.resolve(__dirname, '../node_modules/tsx/dist/cli.mjs');
const run = (args: string, cwd?: string): Promise<{ code: number; stdout: string; stderr: string }> =>
    new Promise(resolve => exec(`node ${tsxPath} ${cliPath} ${args}`, { cwd }, (error: any, stdout: string, stderr: string) =>
        resolve({ code: error ? error.code : 0, stdout, stderr })));

const freePort = (): Promise<number> => new Promise(resolve => {
    const probe = net.createServer().listen(0, () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
});

describe('CLI: projects', () => {
    jest.setTimeout(45000);
    const dirs: string[] = [];
    afterAll(() => dirs.forEach(removeProject));

    const validProject = () => {
        const dir = makeProject(baseManifest({ name: 'cli-demo' }), WWW);
        dirs.push(dir);
        return dir;
    };

    test('`validate` exits 0 for a valid project', async () => {
        const { code, stdout } = await run(`validate ${validProject()}`);
        expect(code).toBe(0);
        expect(stdout).toContain('cli-demo is valid');
    });

    test('`validate` exits 1 and lists each problem with its location', async () => {
        const dir = makeProject(baseManifest({ defaultBehavior: { origin: 'missing' } }), WWW);
        dirs.push(dir);
        const { code, stderr } = await run(`validate ${dir}`);
        expect(code).toBe(1);
        expect(stderr).toContain('/defaultBehavior/origin');
        expect(stderr).toContain('No origin with id "missing"');
    });

    test('`validate` with no argument checks the current folder', async () => {
        const { code, stdout } = await run('validate', validProject());
        expect(code).toBe(0);
        expect(stdout).toContain('cli-demo is valid');
    });

    test('running a project folder serves it', async () => {
        const dir = validProject();
        const port = await freePort();
        const child = spawn('node', [tsxPath, cliPath, dir, '--port', String(port), '--debug']);
        try {
            await new Promise<void>((resolve, reject) => {
                let out = '';
                const timer = setTimeout(() => reject(new Error(`No [Ready] signal. Output:\n${out}`)), 30000);
                child.stdout.on('data', (d: any) => {
                    out += d;
                    if (out.includes('[Ready]')) { clearTimeout(timer); resolve(); }
                });
            });
            const body = await new Promise<string>((resolve, reject) => {
                http.get({ host: '127.0.0.1', port, path: '/' }, (res: any) => {
                    let data = '';
                    res.on('data', (c: any) => data += c);
                    res.on('end', () => resolve(data));
                }).on('error', reject);
            });
            expect(body).toBe('origin-index');
        } finally {
            child.kill();
        }
    });

    test('2.x source flags are rejected for projects', async () => {
        const { code, stderr } = await run(`${validProject()} --edge somewhere.js`);
        expect(code).toBe(1);
        expect(stderr).toContain("--edge doesn't apply to projects");
    });
});
