import fs from 'fs';
import { EdgeRunner } from '../core/EdgeRunner';
import { CFFRunner } from '../core/CFFRunner';
import { CloudFrontizeOptions } from '../core/types';
import { HeaderParser } from '../headerParser';
import { MultiOriginConfig } from '../pipeline/ConfigLoader';
import { Orchestrator } from '../pipeline/Orchestrator';
import { LocalProvider, OriginProvider, S3Provider } from '../pipeline/Providers';
import { Telemetry } from '../pipeline/Telemetry';
import type { Project } from '../project/loadProject';

/** Everything needed to build a runtime; produced by `fromProject` or `fromLegacyOptions` (spec.ts). */
export interface RuntimeSpec {
    /** Effective per-request options: distribution settings and logging flags. */
    options: CloudFrontizeOptions;
    origins: MultiOriginConfig;
    edgeRunner: EdgeRunner | null;
    cffRunner: CFFRunner | null;
    /** Start file watchers on start(). Legacy CLI runners start their own; programmatic 2.x runners never watched. */
    watch: boolean;
    logStream: fs.WriteStream | null;
    headersFile?: string;
    defaultHeaders?: Record<string, any>;
    project?: Project;
}

/**
 * One loaded distribution: its runners, file watchers, origin providers and request pipeline.
 *
 * @namespace Backend
 * The server keeps exactly one current runtime and can swap it (open another project, reload)
 * without restarting its HTTP servers. `dispose()` releases everything the runtime owns.
 */
export class ProjectRuntime {
    readonly orchestrator: Orchestrator;
    readonly options: CloudFrontizeOptions;
    readonly project?: Project;
    private disposed = false;

    constructor(private spec: RuntimeSpec, telemetry: Telemetry) {
        this.options = spec.options;
        this.project = spec.project;

        const providers: Record<string, OriginProvider> = {};
        for (const o of spec.origins.origins) {
            providers[o.id] = o.type === 's3'
                ? new S3Provider(o as any)
                : new LocalProvider(o.directory || spec.options.directory || './www', spec.project ? o.mode : undefined);
        }

        this.orchestrator = new Orchestrator({
            edgeRunner: spec.edgeRunner,
            cffRunner: spec.cffRunner,
            providers,
            behaviors: spec.origins.behaviors,
            telemetry,
            origins: spec.origins,
            port: Number(spec.options.port),
            mode: spec.options.mode || 'rest',
            logStream: spec.logStream
        });
    }

    get edgeRunner() { return this.spec.edgeRunner; }
    /** Whether this runtime watches files (project and CLI servers do; programmatic 2.x runners don't). */
    get watches() { return this.spec.watch; }
    get cffRunner() { return this.spec.cffRunner; }

    /** Starts file watchers (hot reload) for the runners this runtime built. */
    async start(): Promise<void> {
        if (!this.spec.watch) return;
        await this.spec.edgeRunner?.init();
        await this.spec.cffRunner?.init();
    }

    /**
     * Applies the viewer simulation headers.
     * @throws {HeaderConfigError} when the headers file is invalid.
     */
    applyHeaderConfig(): void {
        if (this.spec.headersFile) {
            this.orchestrator.setStickyHeaders(new HeaderParser().load(this.spec.headersFile));
        } else if (this.spec.defaultHeaders) {
            this.orchestrator.setStickyHeaders({ requestHeaders: this.spec.defaultHeaders }, true);
        }
    }

    /** Stops watchers and timers, detaches listeners and closes the log stream. Safe to call twice. */
    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.orchestrator.dispose();
        this.spec.edgeRunner?.close();
        this.spec.cffRunner?.close();
        this.spec.logStream?.end();
    }
}
