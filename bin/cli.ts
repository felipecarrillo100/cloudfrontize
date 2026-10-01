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
import { isProject, loadProject } from '../src/project/loadProject';
import { ManifestError } from '../src/project/errors';
import { formatDiagnostics } from '../src/project/format';

// 2.x source flags that a project configures in cloudfrontize.json instead
const LEGACY_SOURCE_FLAGS: Record<string, string> = {
    edge: '--edge', cff: '--cff', origins: '--origins', s3Origin: '--s3-origin', s3Endpoint: '--s3-endpoint',
    env: '--env', bake: '--bake', output: '--output', headers: '--headers', mode: '--mode'
};
// Flags that override a project's distribution settings for this run
const PROJECT_OVERRIDE_FLAGS = ['strict', 'cors', 'single', 'compression', 'etag', 'requestLogging', 'debug', 'webui', 'log'];

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
        ({ diagnostics } = loadProject(target));
    } catch (err) {
        reportManifestError(err);
    }
    if (diagnostics!.some(d => d.severity !== 'info')) console.warn(formatDiagnostics(diagnostics!.filter(d => d.severity !== 'info')) + '\n');

    let server: CloudFrontizeServer;
    try {
        server = await createServer({ project: target, ...overrides });
    } catch (err) {
        reportManifestError(err); // other startup errors were already reported by the server
        process.exit(1);
    }
    onShutdown(server!);
}

const program = new Command();

program
    .name('cloudfrontize')
    .description('Static server with CloudFront Fidelity: Environments & Variable Baking')
    .version(VERSION)
    .argument('[directory]', 'directory to serve')
    .option('-p, --port <number>', 'port to listen on', '3000')
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
    .option('--allow-networking', 'enable http/https modules in Lambda@Edge sandbox')
    .option('--webui [port]', 'enable the Developer UI on a dedicated port (default: main port + 1)')
    .option('--origins <path>', 'path to JSON file with S3/Multi-Origin configuration')
    .option('--s3-origin <bucket>', 'proxy requests to a real S3 bucket instead of local directory')
    .option('--s3-endpoint <url>', 'custom S3 endpoint (e.g. MinIO) - implies forcePathStyle')
    .option('-m, --mode <mode>', 'routing behavior: website (S3 Website Hosting) or rest (S3 REST/OAC, default)', 'rest')
    .action(async (directory: string, options: any, command: Command) => {
        // 3.x: a folder with cloudfrontize.json (or the current folder, when no 2.x source is given) is a project
        const legacySource = options.edge || options.cff || options.origins || options.s3Origin || options.output;
        if (isProject(directory) || (!directory && !legacySource && isProject(process.cwd()))) {
            return runProject(directory || process.cwd(), options, command);
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
    .action((target: string) => {
        try {
            const { project, diagnostics } = loadProject(target);
            if (diagnostics.length) console.log(formatDiagnostics(diagnostics));
            console.log(`✅ ${project.manifest.name} is valid (${project.manifestPath})`);
        } catch (err) {
            reportManifestError(err);
        }
    });

program.parse(process.argv);
