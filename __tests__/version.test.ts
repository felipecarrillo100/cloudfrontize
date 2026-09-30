export {};
const { exec } = require('child_process');
const path = require('path');
const { VERSION } = require('../src/version');
const pkg = require('../package.json');

const cliPath = path.resolve(__dirname, '../bin/cli.ts');
const tsxPath = path.resolve(__dirname, '../node_modules/tsx/dist/cli.mjs');

describe('Version Reporting', () => {
    jest.setTimeout(30000);

    test('VERSION matches package.json', () => {
        expect(VERSION).toBe(pkg.version);
    });

    test('--version prints the package.json version', (done) => {
        exec(`node ${tsxPath} ${cliPath} --version`, (error: any, stdout: string) => {
            expect(error).toBeNull();
            expect(stdout.trim()).toBe(pkg.version);
            done();
        });
    });
});
