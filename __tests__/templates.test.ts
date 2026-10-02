export {};
const fs = require('fs');
const os = require('os');
const path = require('path');
const { listTemplates, templateFolder } = require('../src/project/templates');
const { createProject } = require('../src/project/create');
const { loadProject } = require('../src/project/loadProject');
const { staticCheck } = require('../src/project/functions');
const { runChecks, readChecks } = require('../src/project/runChecks');

/**
 * Every starter template must make a valid project whose functions build without warnings, and
 * pass its own checks.json (templates that need Docker services are only validated).
 */
const templates = listTemplates();

describe('Starter templates', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cfz-templates-'));
    afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
    beforeAll(() => {
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterAll(() => jest.restoreAllMocks());

    test('the list starts with Empty and includes the agreed templates', () => {
        expect(templates.map((t: any) => t.id)).toEqual(['empty', 'spa', 'security-headers', 'basic-auth', 'redirects', 'geo-routing', 'ab-testing', 's3-origin', 'dynamodb-auth']);
        for (const t of templates) expect(t.description.length).toBeGreaterThan(20);
    });

    test('an unknown template is refused, and nothing is created', () => {
        const dir = path.join(root, 'nope');
        expect(() => createProject({ dir, name: 'x', template: 'nope' })).toThrow(/Unknown template "nope"/);
        expect(() => createProject({ dir, name: 'x', template: '../etc' })).toThrow(/Unknown template/);
        expect(fs.existsSync(dir)).toBe(false);
    });

    for (const t of templates) {
        describe(t.id, () => {
            const dir = path.join(root, t.id);

            test('creates a valid project with the given name', () => {
                createProject({ dir, name: `My ${t.name}`, template: t.id });
                const { project } = loadProject(dir);
                expect(project.manifest.name).toBe(`My ${t.name}`);
                expect(fs.existsSync(path.join(dir, 'template.json'))).toBe(false);
                expect(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8')).toContain('.env');
                if (t.id !== 'empty') expect(fs.existsSync(path.join(dir, 'README.md'))).toBe(true);
            });

            test('its functions build, without warnings', () => {
                const { project } = loadProject(dir);
                for (const fn of Object.values(project.functions) as any[]) {
                    const result = staticCheck(fn.type, fn.runtime, fn.absoluteFile, fs.readFileSync(fn.absoluteFile, 'utf8'));
                    expect([fn.id, result.errors, result.warnings]).toEqual([fn.id, [], []]);
                }
            });

            if (t.id !== 'empty') {
                test('has checks', () => {
                    expect(readChecks(templateFolder(t.id)).length).toBeGreaterThan(0);
                });
            }

            if (!t.requires && t.id !== 'empty') {
                test('passes its checks', async () => {
                    const results = await runChecks(dir);
                    expect(results.filter((r: any) => !r.passed)).toEqual([]);
                });
            }
        });
    }
});
