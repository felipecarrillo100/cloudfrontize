/**
 * The CLI entry point for CloudFrontize.
 * 
 * @namespace Backend
 * This file uses the `commander` package to parse command-line arguments and 
 * initialize the emulation environment. It coordinates the lifecycle of 
 * EdgeRunner and CFFRunner instances before starting the main HTTP server.
 * 
 * It handles critical AWS parity flags:
 * - `--strict`: Enforces production body limits and header restrictions.
 * - `--bake`: Authenticates and injects variables into function code.
 * - `--origins`: Configures multi-origin behaviors.
 */
import { Command } from 'commander';
import path from 'path';
import { startServer } from '../src/index';
import { EdgeRunner } from '../src/core/EdgeRunner';
import { CFFRunner } from '../src/core/CFFRunner';
import { VERSION } from '../src/version';
import { createServer, CloudFrontizeServer } from '../src/server/createServer';
import { runChecks } from '../src/project/runChecks';
import { createProject } from '../src/project/create';
import { listTemplates } from '../src/project/templates';
import { buildProject } from '../src/project/build';
import { importLegacySetup } from '../src/project/importLegacy';
import { ProjectExistsError } from '../src/project/errors';
import { isProject, loadProject } from '../src/project/loadProject';
import { parseSetting, Setting } from '../src/project/settings';
import { ManifestError } from '../src/project/errors';
import { formatDiagnostics } from '../src/project/format';

// 2.x source flags that a project configures in cloudfrontize.json instead
const LEGACY_SOURCE_FLAGS: Record<string, string> = {
    edge: '--edge', cff: '--cff', origins: '--origins', s3Origin: '--s3-origin', s3Endpoint: '--s3-endpoint',
    env: '--env', bake: '--bake', output: '--output', headers: '--headers', mode: '--mode'
};
// Flags that override a project's distribution settings for this run
const PROJECT_OVERRIDE_FLAGS = ['host', 'strict', 'cors', 'single', 'compression', 'etag', 'requestLogging', 'debug', 'webui', 'log'];

// --set path=value, repeatable
const SET_HELP = 'change a cloudfrontize.json setting for this run, e.g. distribution.strict=true (repeatable; the file is not changed)';
const collect = (value: string, previous: string[] = []) => [...previous, value];
const settingsFrom = (list: string[] | undefined): Setting[] => {
    try {
        return (list ?? []).map(parseSetting);
    } catch (err: any) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
    }
};

const onShutdown = (server: CloudFrontizeServer) => {
    const shutdown = async () => {
        console.log(`\n\n👋 \x1b[1mCloudFrontize shutting down gracefully...\x1b[0m`);
        await server.closeGracefully();
        process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
};

const reportManifestError = (err: unknown): never => {
    if (err instanceof ManifestError) {
        console.error(`\n🛑 \x1b[1m${err.manifestPath}\x1b[0m\n${formatDiagnostics(err.diagnostics)}\n`);
        process.exit(1);
    }
    throw err;
};

/** Runs a project folder (cloudfrontize.json) with CLI flags as per-run overrides. */
async function runProject(target: string, options: any, command: Command) {
    const fromCli = (key: string) => command.getOptionValueSource(key) === 'cli';

    const conflicting = Object.keys(LEGACY_SOURCE_FLAGS).filter(fromCli).map(k => LEGACY_SOURCE_FLAGS[k]);
    if (conflicting.length) {
        console.error(`Error: ${conflicting.join(', ')} ${conflicting.length === 1 ? "doesn't" : "don't"} apply to projects; configure ${conflicting.length === 1 ? 'it' : 'them'} in cloudfrontize.json`);
        process.exit(1);
    }

    const overrides: Record<string, any> = {};
    for (const key of PROJECT_OVERRIDE_FLAGS) if (fromCli(key)) overrides[key] = options[key];
    if (fromCli('port')) overrides.port = parseInt(options.port);
    if (fromCli('listen')) overrides.port = parseInt(options.listen);

    let diagnostics;
    try {
        ({ diagnostics } = loadProject(target, { set: settingsFrom(options.set) }));
    } catch (err) {
        reportManifestError(err);
    }
    if (diagnostics!.some(d => d.severity !== 'info')) console.warn(formatDiagnostics(diagnostics!.filter(d => d.severity !== 'info')) + '\n');

    let server: CloudFrontizeServer;
    try {
        server = await createServer({ project: target, recentProjects: true, ...(options.set ? { set: options.set } : {}), ...overrides });
    } catch (err) {
        reportManifestError(err); // other startup errors were already reported by the server
        process.exit(1);
    }
    onShutdown(server!);
}

const program = new Command();

program
    // Options after a subcommand are the subcommand's (import has the same flags as 2.x)
    .enablePositionalOptions()
    .name('cloudfrontize')
    .description('Static server with CloudFront Fidelity: Environments & Variable Baking')
    .version(VERSION)
    .argument('[directory]', 'directory to serve')
    .option('-p, --port <number>', 'port to listen on', '3000')
    .option('--host <address>', 'address to listen on (default: all interfaces; 127.0.0.1 keeps it on this machine)')
    .option('-l, --listen <uri>', 'listen URI', '3000')
    .option('-s, --single', 'SPA mode: rewrite all not-found to index.html')
    .option('-C, --cors', 'enable CORS')
    .option('-d, --debug', 'show negotiation logs')
    .option('-u, --no-compression', 'disable auto-compression for small files')
    .option('--no-etag', 'disable ETag')
    .option('--headers <path>', 'path to JSON file with default request headers')
    .option('-L, --no-request-logging', 'disable per-request access logs')
    .option('--log <path>', 'path to log file for Lambda@Edge console output (overwrites)')
    .option('-e, --edge <path>', 'path to a Lambda@Edge module or directory to simulate')
    .option('--cff <path>', 'path to a CloudFront Functions module or directory to simulate')
    .option('-E, --env <path>', 'path to environment file (Strict: Reserved AWS variables only)')
    .option('-b, --bake <path>', 'path to variables file for __VAR__ string replacement')
    .option('-o, --output <path>', 'output the baked .js file(s) for production deployment')
    .option('--strict', 'enforce strict CloudFront limits (40KB body, forbidden headers)')
    .option('--allow-networking', 'deprecated: Lambda@Edge always has network access, as in AWS')
    .option('--webui [port]', 'enable the Developer UI on a dedicated port (default: main port + 1)')
    .option('--origins <path>', 'path to JSON file with S3/Multi-Origin configuration')
    .option('--s3-origin <bucket>', 'proxy requests to a real S3 bucket instead of local directory')
    .option('--s3-endpoint <url>', 'custom S3 endpoint (e.g. MinIO) - implies forcePathStyle')
    .option('-m, --mode <mode>', 'routing behavior: website (S3 Website Hosting) or rest (S3 REST/OAC, default)', 'rest')
    .option('--set <path=value>', `projects: ${SET_HELP}`, collect)
    .action(async (directory: string, options: any, command: Command) => {
        // 3.x: a folder with cloudfrontize.json (or the current folder, when no 2.x source is given) is a project
        const legacySource = options.edge || options.cff || options.origins || options.s3Origin || options.output;
        if (isProject(directory) || (!directory && !legacySource && isProject(process.cwd()))) {
            return runProject(directory || process.cwd(), options, command);
        }

        if (options.set) {
            console.error('Error: --set changes cloudfrontize.json settings, so it needs a project (turn this setup into one with `cloudfrontize import`)');
            process.exit(1);
        }

        // 2.x command lines keep working; 3.0 suggests turning them into a project
        if (!options.output) {
            const parts = ['cloudfrontize import'];
            if (directory) parts.push(directory);
            for (const [flag, key] of [['--edge', 'edge'], ['--cff', 'cff'], ['--origins', 'origins'], ['--headers', 'headers'], ['--env', 'env'], ['--bake', 'bake'], ['--s3-origin', 's3Origin'], ['--s3-endpoint', 's3Endpoint']]) {
                if (options[key]) parts.push(flag, options[key]);
            }
            if (options.mode && options.mode !== 'rest') parts.push('--mode', options.mode);
            parts.push('--out', 'my-project');
            console.warn(`\x1b[90mℹ️  This is a 2.x command line. It keeps working; for cache behaviors, the workbench editor and AWS rule checks, turn it into a project:\n   ${parts.join(' ')}\x1b[0m`);
        }

        if ((options.output || options.bake) && (!options.edge && !options.cff)) {
            console.error('Error: --bake and --output require a source --edge or --cff file');
            process.exit(1);
        }

        // Validation: Directory, Origins JSON, or S3 Origin is mandatory unless we are just baking
        if (!directory && !options.origins && !options.s3Origin && !options.output) {
            console.error('Error: A directory to serve or --s3-origin must be provided');
            process.exit(1);
        }

        const port = options.listen !== '3000' ? options.listen : options.port;

        if (options.allowNetworking) {
            console.warn('⚠️  --allow-networking is no longer needed: Lambda@Edge functions have network access, as in AWS (calls to localhost or private addresses show a warning, since AWS can\'t reach them).');
        }

        // --webui takes an optional port; without one it defaults to the main port + 1 (see startServer)
        if (options.webui !== undefined && options.webui !== true) {
            const uiPort = Number(options.webui);
            if (!Number.isInteger(uiPort) || uiPort < 1 || uiPort > 65535) {
                console.error(`Error: --webui expects a port number between 1 and 65535, got "${options.webui}"`);
                process.exit(1);
            }
        }
        const isJustBaking = options.output && !directory && !options.origins && !options.s3Origin;

        let edgeRunner: EdgeRunner | null = null;
        let cffRunner: CFFRunner | null = null;

        const commonOptions = {
            verbose: options.debug,
            strict: options.strict,
            bakePath: options.bake ? path.resolve(options.bake) : undefined,
            outputPath: options.output ? path.resolve(options.output) : undefined,
            watch: !isJustBaking
        };

        if (options.edge) {
            edgeRunner = new EdgeRunner(path.resolve(options.edge), {
                ...commonOptions,
                allowNetworking: options.allowNetworking,
                logPath: options.log ? path.resolve(options.log) : undefined,
                envPath: options.env ? path.resolve(options.env) : undefined
            });
            await edgeRunner.init();
        }

        if (options.cff) {
            cffRunner = new CFFRunner(path.resolve(options.cff), commonOptions);
            await cffRunner.init();
        }

        if (isJustBaking) {
            // The server normally triggers the first load; without a server, load here so files are written
            const failures: string[] = [];
            for (const runner of [edgeRunner, cffRunner]) {
                if (!runner) continue;
                runner.on('build_error', (e: any) => failures.push(`${e.file || e.path}: ${e.error}`));
                runner.load();
            }
            if (failures.length > 0) {
                console.error(`🛑 Build failed:\n   ${failures.join('\n   ')}`);
                process.exit(1);
            }
            console.log(`✅ Production-ready file(s) generated at: ${options.output}`);
            process.exit(0);
        }

        const displayPort = parseInt(port);

        const server = startServer({
            ...options,
            port: displayPort,
            directory: directory ? path.resolve(directory) : undefined,
            edgeRunner,
            cffRunner
        });

        // Startup problems (busy port, invalid headers file) were already reported by the server
        server.ready.catch(() => process.exit(1));
        onShutdown(server);
    });

program
    .command('validate')
    .description('check a project against AWS CloudFront rules')
    .argument('[project]', 'project folder or cloudfrontize.json', '.')
    .option('--set <path=value>', SET_HELP, collect)
    .action((target: string, options: { set?: string[] }) => {
        try {
            const { project, diagnostics } = loadProject(target, { set: settingsFrom(options.set) });
            if (diagnostics.length) console.log(formatDiagnostics(diagnostics));
            console.log(`✅ ${project.manifest.name} is valid${project.settings.length ? ` with ${project.settings.join(', ')}` : ''} (${project.manifestPath})`);
        } catch (err) {
            reportManifestError(err);
        }
    });

program
    .command('init')
    .description('create a project from a template (see `cloudfrontize templates`)')
    .argument('[dir]', 'folder for the project (created if missing; must be empty)', '.')
    .option('-t, --template <id>', 'starter template', 'empty')
    .option('-n, --name <name>', 'project name (default: the folder name)')
    .action((dir: string, options: { template: string; name?: string }) => {
        const target = path.resolve(dir);
        const name = options.name ?? path.basename(target);
        try {
            createProject({ dir: target, name, template: options.template });
        } catch (err: any) {
            if (err instanceof ManifestError) reportManifestError(err);
            console.error(`🛑 ${err instanceof ProjectExistsError ? `${err.message}: choose an empty or new folder` : err.message}`);
            process.exit(1);
        }
        const template = listTemplates().find(t => t.id === options.template);
        // Inside the current folder: a short relative path; elsewhere: the absolute one
        const rel = path.relative(process.cwd(), target);
        const relative = rel === '' ? '.' : rel.startsWith('..') || path.isAbsolute(rel) ? target : rel;
        console.log(`✅ Created "${name}" from the ${template?.name ?? options.template} template in ${relative}`);
        if (template?.requires) console.log(`   Needs ${template.requires}: see README.md`);
        console.log(`\n   ${relative === '.' ? '' : `cd ${relative}\n   `}cloudfrontize --webui     # serve it, with the workbench\n   cloudfrontize check       # run its checks.json`);
    });

program
    .command('templates')
    .description('list the starter templates for `cloudfrontize init`')
    .action(() => {
        const items = listTemplates();
        const width = Math.max(...items.map(t => t.id.length));
        for (const t of items) console.log(`  ${t.id.padEnd(width)}  ${t.name}${t.requires ? ` (needs ${t.requires})` : ''}\n  ${' '.repeat(width)}  \x1b[90m${t.description}\x1b[0m`);
    });

program
    .command('import')
    .description('turn a 2.x setup into a project: same arguments as the 2.x command, plus --out')
    .argument('[directory]', 'the folder 2.x served')
    .requiredOption('--out <dir>', 'folder for the new project (created; must be empty)')
    .option('-n, --name <name>', 'project name (default: the folder name)')
    .option('-e, --edge <path>', 'Lambda@Edge module or folder')
    .option('--cff <path>', 'CloudFront Functions module or folder')
    .option('--origins <path>', 'S3 / multi-origin JSON')
    .option('--headers <path>', 'viewer headers JSON')
    .option('-E, --env <path>', 'environment file (reserved AWS variables)')
    .option('-b, --bake <path>', 'bake file (__VAR__ values)')
    .option('--s3-origin <bucket>', 'S3 bucket origin')
    .option('--s3-endpoint <url>', 'S3 endpoint (MinIO, LocalStack)')
    .option('-m, --mode <mode>', 'rest or website', 'rest')
    .action((directory: string | undefined, options: any) => {
        let result;
        try {
            result = importLegacySetup({ directory, edge: options.edge, cff: options.cff, origins: options.origins, headers: options.headers, env: options.env, bake: options.bake, s3Origin: options.s3Origin, s3Endpoint: options.s3Endpoint, mode: options.mode }, options.out, options.name);
        } catch (err: any) {
            if (err instanceof ManifestError) reportManifestError(err);
            console.error(`🛑 ${err instanceof ProjectExistsError ? `${err.message}: choose an empty or new folder` : err.message}`);
            process.exit(1);
        }
        console.log(`✅ Imported into ${result.dir}`);
        for (const note of result.notes) console.log(`   \x1b[33m•\x1b[0m ${note}`);
        const rel = path.relative(process.cwd(), result.dir);
        console.log(`\n   cd ${rel.startsWith('..') ? result.dir : rel || '.'}\n   cloudfrontize validate\n   cloudfrontize --webui`);
    });

program
    .command('build')
    .description('write deployable function code: __VAR__ values baked in, optionally minified, checked as AWS will see it')
    .argument('[project]', 'project folder or cloudfrontize.json', '.')
    .option('-o, --out <dir>', 'output folder (replaced; default: <project>/dist)')
    .option('-l, --level <level>', 'baked, minified or uglified', 'baked')
    .option('-b, --bake <file>', "bake file for this build, instead of the project's (e.g. config/production.env)")
    .option('--set <path=value>', SET_HELP, collect)
    .action(async (target: string, options: { out?: string; level: string; bake?: string; set?: string[] }) => {
        if (!['baked', 'minified', 'uglified'].includes(options.level)) {
            console.error(`Error: --level must be baked, minified or uglified, got "${options.level}"`);
            process.exit(1);
        }
        let report;
        try {
            settingsFrom(options.set);
            report = await buildProject(target, { outDir: options.out, level: options.level as any, bakeFile: options.bake, set: options.set });
        } catch (err: any) {
            if (err instanceof ManifestError) reportManifestError(err);
            console.error(`🛑 ${err.message}`);
            process.exit(1);
        }
        const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
        for (const f of report.functions) {
            const where = f.associations.map(a => `${a.behavior === 'default' ? '*' : a.behavior} ${a.event}`).join(', ') || 'not attached';
            const mark = f.errors.length ? '\x1b[31m✗\x1b[0m' : '\x1b[32m✓\x1b[0m';
            console.log(`${mark} ${f.output}  \x1b[90m${kb(f.size)}${f.type === 'cloudfront-function' ? ' of 10 KB' : ''} · ${where}\x1b[0m`);
            for (const e of f.errors) console.log(`    \x1b[31m${e.message}${e.line ? ` (line ${e.line})` : ''}\x1b[0m`);
            for (const w of f.warnings) console.log(`    \x1b[33m${w.message}${w.line ? ` (line ${w.line})` : ''}\x1b[0m`);
        }
        for (const k of report.keyValueStores) console.log(`\x1b[32m✓\x1b[0m ${k.output}  \x1b[90m${k.keyCount} keys\x1b[0m`);
        const failed = report.functions.filter(f => f.errors.length).length;
        console.log(failed
            ? `\n\x1b[31m${failed} function${failed === 1 ? '' : 's'} wouldn't deploy\x1b[0m (output written to ${report.outDir})`
            : `\n✅ Built ${report.functions.length} function${report.functions.length === 1 ? '' : 's'} (${report.level}) in ${report.outDir}; see build.json`);
        process.exit(failed ? 1 : 0);
    });

program
    .command('check')
    .description("run a project's checks.json against it (requests and the responses they must get)")
    .argument('[project]', 'project folder or cloudfrontize.json', '.')
    .option('-d, --debug', 'show the request log and function output')
    .option('--set <path=value>', SET_HELP, collect)
    .action(async (target: string, options: { debug?: boolean; set?: string[] }) => {
        let results;
        try {
            loadProject(target, { set: settingsFrom(options.set) });
            // Functions' own console output is shown only with --debug
            const quiet = !options.debug;
            const original = { log: console.log, warn: console.warn };
            if (quiet) { console.log = () => {}; console.warn = () => {}; }
            try {
                results = await runChecks(target, { verbose: options.debug, set: options.set });
            } finally {
                Object.assign(console, original);
            }
        } catch (err: any) {
            if (err instanceof ManifestError) reportManifestError(err);
            console.error(`🛑 ${err.message}`);
            process.exit(1);
        }
        for (const r of results) {
            console.log(`${r.passed ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${r.name}`);
            for (const f of r.failures) console.log(`    \x1b[31m${f}\x1b[0m`);
        }
        const failed = results.filter(r => !r.passed).length;
        console.log(`\n${failed ? `\x1b[31m${failed} of ${results.length} checks failed\x1b[0m` : `\x1b[32mAll ${results.length} checks passed\x1b[0m`}`);
        process.exit(failed ? 1 : 0);
    });

program.parse(process.argv);
