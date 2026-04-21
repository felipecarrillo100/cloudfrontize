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

declare const __PKG_VERSION__: string | undefined;

const program = new Command();
const version = typeof __PKG_VERSION__ !== 'undefined' ? __PKG_VERSION__ : '1.10.2';

program
    .name('cloudfrontize')
    .description('Static server with CloudFront Fidelity: Environments & Variable Baking')
    .version(version)
    .argument('[directory]', 'directory to serve')
    .option('-p, --port <number>', 'port to listen on', '3000')
    .option('-l, --listen <uri>', 'listen URI', '3000')
    .option('-s, --single', 'SPA mode: rewrite all not-found to index.html')
    .option('-C, --cors', 'enable CORS')
    .option('-d, --debug', 'show negotiation logs')
    .option('-u, --no-compression', 'disable auto-compression for small files')
    .option('--no-etag', 'disable ETag')
    .option('--headers <path>', 'path to JSON file with default request headers')
    .option('-L, --no-request-logging', 'mute logs')
    .option('--log <path>', 'path to log file for Lambda@Edge console output (overwrites)')
    .option('-e, --edge <path>', 'path to a Lambda@Edge module or directory to simulate')
    .option('--cff <path>', 'path to a CloudFront Functions module or directory to simulate')
    .option('-E, --env <path>', 'path to environment file (Strict: Reserved AWS variables only)')
    .option('-b, --bake <path>', 'path to variables file for __VAR__ string replacement')
    .option('-o, --output <path>', 'output the baked .js file(s) for production deployment')
    .option('--strict', 'enforce strict CloudFront limits (40KB body, forbidden headers)')
    .option('--allow-networking', 'enable http/https modules in Lambda@Edge sandbox')
    .option('--webui [port]', 'enable the Developer UI on a dedicated port')
    .option('--origins <path>', 'path to JSON file with S3/Multi-Origin configuration')
    .option('--s3-origin <bucket>', 'proxy requests to a real S3 bucket instead of local directory')
    .option('--s3-endpoint <url>', 'custom S3 endpoint (e.g. MinIO) - implies forcePathStyle')
    .option('-m, --mode <mode>', 'routing behavior: website (S3 Website Hosting) or rest (S3 REST/OAC, default)', 'rest')
    .action(async (directory: string, options: any) => {
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

        const shutdown = async () => {
            console.log(`\n\n👋 \x1b[1mCloudFrontize shutting down gracefully...\x1b[0m`);
            await server.closeGracefully();
            process.exit(0);
        };

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
    });

program.parse(process.argv);
