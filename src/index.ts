import { EdgeRunner } from './core/EdgeRunner';
import { CFFRunner } from './core/CFFRunner';
import { AWS_HEADERS, AWS_LIMITS } from './constants';
import { CloudFrontizeOptions } from './core/types';
import { HeaderParser } from './headerParser';
import { buildServer, CloudFrontizeServer, createServer, CreateServerOptions } from './server/createServer';
import { printBottomBanner, printTopBanner } from './server/banner';
import { fromLegacyOptions } from './runtime/spec';
import { loadProject, checkManifest, isProject, Project } from './project/loadProject';
import { ManifestSchema, Manifest } from './project/schema';
import { Diagnostic, ManifestError, PortInUseError, ServerStartError, HeaderConfigError } from './project/errors';
import { Logger, ConsoleSink, FileSink, defaultLogger } from './core/Logger';
import { VERSION } from './version';
import { createProject } from './project/create';
import { listTemplates } from './project/templates';
import { buildProject } from './project/build';
import { importLegacySetup } from './project/importLegacy';
import { runChecks } from './project/runChecks';

export {
    // 3.x
    createServer, CreateServerOptions, loadProject, checkManifest, isProject, Project, ManifestSchema, Manifest,
    Diagnostic, ManifestError, PortInUseError, ServerStartError, HeaderConfigError,
    Logger, ConsoleSink, FileSink, defaultLogger, VERSION,
    createProject, listTemplates, buildProject, importLegacySetup, runChecks,
    // 2.x (still supported)
    EdgeRunner, CFFRunner, AWS_HEADERS, AWS_LIMITS, HeaderParser, CloudFrontizeOptions, CloudFrontizeServer,
    printTopBanner, printBottomBanner
};

/**
 * Starts a server from 2.x-style options (a directory, `--edge`/`--cff` paths or prebuilt runners,
 * an `--origins` file). Returns immediately; await `server.ready` to know when it's listening.
 * @deprecated For projects, use {@link createServer}.
 */
export function startServer(options: CloudFrontizeOptions): CloudFrontizeServer {
    // Normalize: --debug (CLI flag) is the canonical name; verbose is the internal alias.
    options.verbose = options.debug || options.verbose;

    // --webui without a value: default to the main port + 1 (an ephemeral port when the main port is 0)
    if (options.webui === true) {
        options.webui = Number(options.port) > 0 ? Number(options.port) + 1 : 0;
    }

    return buildServer(fromLegacyOptions(options));
}
