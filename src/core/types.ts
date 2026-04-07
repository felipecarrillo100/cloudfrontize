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
