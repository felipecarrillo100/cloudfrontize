export type HookType = 'viewer-request' | 'origin-request' | 'origin-response' | 'viewer-response';

export interface RunnerOptions {
    envPath?: string;
    bakePath?: string;
    outputPath?: string;
    strict?: boolean;
    verbose?: boolean;
    allowNetworking?: boolean;
    logPath?: string;
    logStream?: any;
    watch?: boolean;
    debug?: boolean;
}

export interface HookModule {
    id: string;
    handler: any;
    filePath: string;
}

export type Registry = Record<HookType, HookModule[]>;

export interface HookExecutionResult {
    result: any;
    durationMs: number;
}

export interface OriginConfig {
    id: string;
    type: 's3' | 'local' | 'custom';
    bucket?: string;
    region?: string;
    endpoint?: string;
    directory?: string;
    domain?: string;
    protocol?: 'http' | 'https';
    forcePathStyle?: boolean;
    credentials?: {
        accessKeyId: string;
        secretAccessKey: string;
        sessionToken?: string;
    };
    mode?: 'website' | 'rest';
}

export interface CacheBehavior {
    pathPattern: string;
    targetOriginId: string;
}

export interface CloudFrontizeOptions {
    port: number;
    /** Developer UI port. `true` (a bare `--webui`) means the main port + 1; 0 picks an ephemeral port. */
    webui?: string | number | boolean;
    /** Overrides the directory the Developer UI assets are served from (defaults to the bundled `ui/`). */
    uiDir?: string;
    mode?: 'rest' | 'website';
    debug?: boolean;
    strict?: boolean;
    single?: boolean;
    cors?: boolean;
    verbose?: boolean;
    log?: string;
    origins?: string;
    directory?: string;
    edge?: string;
    cff?: string;
    headers?: string;
    defaultHeaders?: Record<string, any>;
    /** Commander's `-u, --no-compression` sets this to false. `noCompression` is the programmatic alias. */
    compression?: boolean;
    noCompression?: boolean;
    /** `--no-etag` sets this to false (ETags are on by default). */
    etag?: boolean;
    /** `-L, --no-request-logging` sets this to false to mute per-request access logs. */
    requestLogging?: boolean;
    noBanner?: boolean;
    s3Origin?: string;
    s3Endpoint?: string;
    s3Region?: string;
    edgeRunner?: any; // Avoiding circular dependency with EdgeRunner
    cffRunner?: any; // Avoiding circular dependency with CFFRunner
    logStream?: any; // Avoiding circular dependency with fs.WriteStream
}
