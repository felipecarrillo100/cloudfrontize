import fs from 'fs';
import path from 'path';
import { EdgeRunner } from '../core/EdgeRunner';
import { CFFRunner } from '../core/CFFRunner';
import { CacheBehavior, CloudFrontizeOptions, OriginConfig, RunnerFile } from '../core/types';
import { ConfigLoader, MultiOriginConfig } from '../pipeline/ConfigLoader';
import type { Project } from '../project/loadProject';
import { EVENT_TYPES } from '../project/schema';
import { RuntimeSpec } from './ProjectRuntime';

const openLogStream = (logFile: string | undefined): fs.WriteStream | null => {
    if (!logFile) return null;
    try {
        const logPath = path.resolve(logFile);
        fs.mkdirSync(path.dirname(logPath), { recursive: true });
        return fs.createWriteStream(logPath, { flags: 'w' });
    } catch (err: any) {
        console.warn(`\x1b[33m⚠️  [Forensic] Failed to initialize log stream: ${err.message}\x1b[0m`);
        return null;
    }
};

/**
 * 2.x flags and the programmatic `startServer` options → a runtime spec. Behavior is unchanged
 * from 2.x: directory runners, prebuilt runner instances, the `--origins` JSON and `-m` mode.
 */
export function fromLegacyOptions(options: CloudFrontizeOptions): RuntimeSpec {
    const logStream = openLogStream(options.log);

    const origins = ConfigLoader.applyCliOverrides(
        options.origins ? ConfigLoader.load(options.origins) : ConfigLoader.fromCLI(options, options.directory),
        options
    );

    const commonOptions = { ...options, logStream };
    const edgeRunner = options.edgeRunner || (options.edge ? new EdgeRunner(options.edge, commonOptions) : null);
    const cffRunner = options.cffRunner || (options.cff ? new CFFRunner(options.cff, commonOptions) : null);

    // A server-level --strict applies to a runner that was built without it (set once, not per request)
    if (options.strict && edgeRunner) edgeRunner.options.strict = true;

    // 2.x callers read these back from the options object
    options.edgeRunner = edgeRunner;
    options.cffRunner = cffRunner;
    options.logStream = logStream;

    return {
        options,
        origins,
        edgeRunner,
        cffRunner,
        watch: false,
        logStream,
        headersFile: options.headers ? path.resolve(options.headers) : undefined,
        defaultHeaders: options.defaultHeaders
    };
}

/** Settings a caller (usually the CLI) may override on top of the project's manifest. */
export type ProjectOverrides = Partial<Pick<CloudFrontizeOptions,
    'port' | 'webui' | 'debug' | 'verbose' | 'noBanner' | 'log' | 'strict' | 'cors' | 'single' | 'compression' | 'etag' | 'requestLogging' | 'uiDir'>>;

/**
 * A validated project → a runtime spec. The manifest decides which files run at which stage; no
 * stage detection is involved.
 * @throws {ManifestError} for manifest features this build can't run yet.
 */
export function fromProject(project: Project, overrides: ProjectOverrides = {}): RuntimeSpec {
    const { manifest } = project;

    const defined = Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== undefined));
    const d = manifest.distribution;
    const options: CloudFrontizeOptions = {
        port: d.port,
        strict: d.strict,
        cors: d.cors,
        single: d.spa,
        compression: d.compression,
        etag: d.etag,
        requestLogging: d.requestLogging,
        mode: 'rest',
        ...defined
    } as CloudFrontizeOptions;
    options.verbose = options.debug || options.verbose;

    // Each behavior lists its own functions per event (AWS: at most one per event)
    const functionLists = (functions: Project['defaultBehavior']['functions']): CacheBehavior['functions'] =>
        Object.fromEntries(EVENT_TYPES.filter(e => functions[e]).map(e => [e, [functions[e]!]]));

    // Behaviors are matched in order; the default behavior ("*") comes last
    const origins: MultiOriginConfig = {
        origins: project.origins.map((o): OriginConfig => o.type === 'local'
            ? { id: o.id, type: 'local', directory: o.absolutePath, mode: o.mode }
            : { id: o.id, type: 's3', bucket: o.bucket, region: o.region, endpoint: o.endpoint, forcePathStyle: o.forcePathStyle, mode: o.mode, credentials: o.credentials as any }),
        behaviors: [
            ...project.behaviors.map(b => ({ key: b.pathPattern, pathPattern: b.pathPattern, targetOriginId: b.origin, functions: functionLists(b.functions) })),
            { key: 'default', pathPattern: '*', targetOriginId: project.defaultBehavior.origin, functions: functionLists(project.defaultBehavior.functions) }
        ]
    };

    // Function pool: each attached function is compiled once, whatever behaviors and events use it.
    // Its stage is the first event it's attached to (Lambda@Edge module rules use it until 2.3).
    const edgeFiles: RunnerFile[] = [];
    const cffFiles: RunnerFile[] = [];
    const pooled = new Set<string>();
    for (const b of [project.defaultBehavior, ...project.behaviors]) {
        for (const event of EVENT_TYPES) {
            const fnId = b.functions[event];
            if (!fnId || pooled.has(fnId)) continue;
            pooled.add(fnId);
            const fn = project.functions[fnId];
            if (fn.type === 'lambda-edge') {
                edgeFiles.push({ path: fn.absoluteFile, stage: event, id: fnId });
            } else {
                const store = fn.keyValueStore ? project.manifest.keyValueStores[fn.keyValueStore] : undefined;
                cffFiles.push({ path: fn.absoluteFile, stage: event, id: fnId, runtime: fn.runtime, kvsFile: store ? path.resolve(project.dir, store.file) : undefined });
            }
        }
    }

    const logStream = openLogStream(options.log);
    const runnerOptions = {
        strict: options.strict,
        verbose: options.verbose,
        debug: options.debug,
        envPath: project.envFile,
        bakePath: project.bakeFile,
        logStream,
        watch: true
    };
    const edgeRunner = edgeFiles.length ? new EdgeRunner(null, { ...runnerOptions, files: edgeFiles }) : null;
    const cffRunner = cffFiles.length ? new CFFRunner(null, { ...runnerOptions, files: cffFiles }) : null;

    // The 2.x banner reads these from the options object
    options.edgeRunner = edgeRunner;
    options.cffRunner = cffRunner;

    return {
        options,
        origins,
        edgeRunner,
        cffRunner,
        watch: true,
        logStream,
        headersFile: project.viewerHeadersFile,
        project
    };
}
