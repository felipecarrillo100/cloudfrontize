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
        // Loopback, like the other test servers: a wildcard socket can have its 127.0.0.1 traffic taken (see CloudFrontizeOptions.host)
        const child = spawn('node', [tsxPath, cliPath, dir, '--port', String(port), '--host', '127.0.0.1', '--debug']);
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

    test('`templates` lists the starter templates', async () => {
        const { code, stdout } = await run('templates');
        expect(code).toBe(0);
        for (const id of ['empty', 'spa', 'basic-auth', 's3-origin']) expect(stdout).toContain(id);
        expect(stdout).toContain('needs Docker (MinIO)');
    });

    test('`init` creates a project from a template; `check` runs its checks', async () => {
        const parent = makeProject(baseManifest(), WWW);
        dirs.push(parent);
        const target = path.join(parent, 'guarded');
        const init = await run(`init ${target} --template basic-auth --name Guarded`);
        expect(init.code).toBe(0);
        expect(init.stdout).toContain('Created "Guarded" from the Basic auth template');

        const check = await run(`check ${target}`);
        // On failure, show what the command printed
        expect({ code: check.code, out: check.stdout + check.stderr }).toEqual({ code: 0, out: expect.stringContaining('All 4 checks passed') });

        // A folder that's already a project is refused
        const again = await run(`init ${target}`);
        expect(again.code).toBe(1);
        expect(again.stderr).toContain('already a project');
    });

    test('`check` exits 1 when a check fails, saying why', async () => {
        const dir = makeProject(baseManifest(), WWW);
        dirs.push(dir);
        require('fs').writeFileSync(path.join(dir, 'checks.json'), JSON.stringify({ checks: [{ name: 'expects a teapot', request: { path: '/index.html' }, expect: { status: 418 } }] }));
        const { code, stdout } = await run(`check ${dir}`);
        expect(code).toBe(1);
        expect(stdout).toContain('status 200, expected 418');
        expect(stdout).toContain('1 of 1 checks failed');
    });

    test('`init` with an unknown template lists the available ones', async () => {
        const parent = makeProject(baseManifest(), WWW);
        dirs.push(parent);
        const { code, stderr } = await run(`init ${path.join(parent, 'x')} --template nope`);
        expect(code).toBe(1);
        expect(stderr).toContain('Unknown template "nope". Available: empty, spa');
    });

    test('`import` takes a 2.x command line\'s arguments; `build` writes the deployable code', async () => {
        const fs = require('fs');
        const legacy = makeProject(baseManifest(), WWW);
        dirs.push(legacy);
        fs.mkdirSync(path.join(legacy, 'hooks'));
        fs.writeFileSync(path.join(legacy, 'hooks', 'viewer-response.tag.js'), "exports.handler = async (e) => e.Records[0].cf.response;\n");
        const out = path.join(legacy, 'imported');

        const imp = await run(`import ${path.join(legacy, 'origins/www')} --edge ${path.join(legacy, 'hooks')} --out ${out} --name Imported`);
        expect(imp.code).toBe(0);
        expect(imp.stdout).toContain(`Imported into ${out}`);
        expect(JSON.parse(fs.readFileSync(path.join(out, 'cloudfrontize.json'), 'utf8')).defaultBehavior.functions).toEqual({ 'viewer-response': 'tag' });

        const build = await run(`build ${out} --level minified`);
        expect(build.code).toBe(0);
        expect(build.stdout).toContain('lambda-edge/tag/index.js');
        expect(fs.existsSync(path.join(out, 'dist', 'build.json'))).toBe(true);

        expect((await run(`build ${out} --level gzip`)).code).toBe(1);
        expect((await run(`import --out ${out}`)).stderr).toContain("isn't empty");
    });
});

