/**
 * The WebUI API v2 contract: every request and response shape, and the event stream's events.
 *
 * @namespace Backend
 * Types only, with no imports, so the browser UI (`ui-src`) compiles against exactly what the server
 * sends. The server modules use these types too; changing one is a change for both sides.
 */

// ---------- Shared ----------

/**
 * Headers CloudFront adds to requests (source: "Add CloudFront request headers"). Lambda@Edge sees
 * them only in origin events; CloudFront Functions see them on viewer events too.
 */
export const CLOUDFRONT_ADDED_HEADERS = [
    // Device type
    'cloudfront-is-android-viewer', 'cloudfront-is-desktop-viewer', 'cloudfront-is-ios-viewer',
    'cloudfront-is-mobile-viewer', 'cloudfront-is-smarttv-viewer', 'cloudfront-is-tablet-viewer',
    // Viewer location
    'cloudfront-viewer-address', 'cloudfront-viewer-asn', 'cloudfront-viewer-country', 'cloudfront-viewer-city',
    'cloudfront-viewer-country-name', 'cloudfront-viewer-country-region', 'cloudfront-viewer-country-region-name',
    'cloudfront-viewer-latitude', 'cloudfront-viewer-longitude', 'cloudfront-viewer-metro-code',
    'cloudfront-viewer-postal-code', 'cloudfront-viewer-time-zone',
    // Viewer header structure
    'cloudfront-viewer-header-order', 'cloudfront-viewer-header-count',
    // TLS
    'cloudfront-viewer-ja3-fingerprint', 'cloudfront-viewer-ja4-fingerprint', 'cloudfront-viewer-tls',
    // Other
    'cloudfront-error-uri', 'cloudfront-error-args', 'cloudfront-forwarded-proto', 'cloudfront-viewer-http-version'
] as const;

export type EdgeEvent = 'viewer-request' | 'origin-request' | 'origin-response' | 'viewer-response';
export type FunctionRuntime = 'cloudfront-function' | 'lambda-edge';
export type FunctionType = FunctionRuntime;
export type HeaderMap = Record<string, string | string[]>;

/** A problem found while loading or validating a project. `path` is a JSON pointer into the manifest. */
export interface Diagnostic {
    severity: 'error' | 'warning' | 'info';
    path: string;
    rule: string;
    message: string;
}

/** The body of every error response. */
export interface ApiErrorBody {
    error: { code: string; message: string; details?: unknown };
}

// ---------- Server and project ----------

export interface ServerInfo {
    apiVersion: number;
    version: string;
    ports: { main: number; webui: number };
    project: { name: string; dir: string } | null;
    /** True when the server runs a 2.x command-line setup (no project). */
    legacy: boolean;
    routes: { method: string; path: string }[];
}

export interface ProjectInfo {
    name: string;
    dir: string;
    manifestPath: string;
    revision: string;
    /** The manifest as written (no defaults applied). */
    manifest: Record<string, any>;
    diagnostics: Diagnostic[];
}

export interface SaveResult {
    revision: string;
    diagnostics: Diagnostic[];
}

// ---------- Distribution (both projects and 2.x setups) ----------

export interface DistributionFunction {
    id: string;
    type: FunctionType;
    runtime: string | null;
    /** As written in the manifest (null for 2.x setups). */
    file: string | null;
    path: string;
    disabled: boolean;
    build: FunctionBuildState;
}

export interface DistributionBehavior {
    /** "default", or the path pattern. */
    key: string;
    pathPattern: string | null;
    origin: string;
    functions: Partial<Record<EdgeEvent, string>>;
}

export interface DistributionOrigin {
    id: string;
    type: string;
    path?: string;
    bucket?: string;
    region?: string;
    endpoint?: string;
    mode?: string;
    /** Credentials are never sent; only whether some are configured. */
    credentials?: { configured: true };
}

export interface Distribution {
    mode: 'project' | 'legacy';
    project: { name: string; dir: string; revision: string } | null;
    functions: DistributionFunction[];
    behaviors: DistributionBehavior[];
    origins: DistributionOrigin[];
}

export type ControlAction = 'enable' | 'disable' | 'isolate' | 'reset';

// ---------- Functions and files ----------

export interface CodeProblem {
    message: string;
    line: number | null;
    column?: number | null;
}

export interface BuildResult {
    status: 'ok' | 'error';
    /** `runtime`: the emulator rebuilt it; `static`: the code alone was checked (function not attached). */
    checkedBy: 'runtime' | 'static';
    size: number;
    /** AWS size limit when there's a single one (CloudFront Functions: 10 KB). */
    sizeLimit: number | null;
    errors: CodeProblem[];
    warnings: CodeProblem[];
}

export interface FunctionBuildState {
    /** `unused`: no behavior uses the function; `missing`: its file doesn't exist. */
    status: 'ok' | 'error' | 'unused' | 'missing';
    error?: CodeProblem;
}

export interface Attachment {
    behavior: string;
    event: EdgeEvent;
}

export interface FunctionInfo {
    id: string;
    type: FunctionType;
    runtime: string;
    file: string;
    path: string;
    keyValueStore?: string;
    attachments: Attachment[];
    disabled: boolean;
    size: number | null;
    build: FunctionBuildState;
}

export interface FileContent {
    content: string;
    revision: string;
}

export interface FunctionDetail extends FunctionInfo {
    source: FileContent | null;
}

export interface SourceSaveResult {
    revision: string;
    build: BuildResult;
}

export interface KvsProblem {
    severity: 'error' | 'warning';
    message: string;
}

export interface KvsInfo {
    id: string;
    file: string;
    path: string;
    keyCount: number;
    size: number | null;
    usedBy: string[];
    problems: KvsProblem[];
}

export interface KvsDetail extends KvsInfo {
    source: FileContent | null;
}

export interface ViewerHeadersFile {
    file: string | null;
    content: string | null;
    revision: string | null;
}

export type ProductionLevel = 'baked' | 'minified' | 'uglified';

export interface ProductionCode {
    level: ProductionLevel;
    code: string;
}

export interface OriginCheck {
    ok: boolean;
    message: string;
}

/** The viewer simulation in effect: from the project's file, or set for this session (2.x setups). */
export interface ViewerSimulation {
    source: 'file' | 'session';
    requestHeaders: Record<string, string>;
    responseHeaders: Record<string, string>;
}

// ---------- Workspace ----------

export interface FolderEntry {
    name: string;
    path: string;
    isProject: boolean;
    hidden: boolean;
}

export interface FolderListing {
    path: string;
    parent: string | null;
    isProject: boolean;
    entries: FolderEntry[];
    truncated: boolean;
    roots: string[];
}

export interface TemplateInfo {
    id: string;
    name: string;
    description: string;
    /** What it needs besides CloudFrontize (e.g. "Docker (MinIO)"). */
    requires?: string;
    order: number;
}

export interface RecentProject {
    dir: string;
    name: string;
    openedAt: string;
    exists: boolean;
}

export interface InvokeRequest {
    method?: string;
    path: string;
    headers?: Record<string, string>;
    body?: string;
    bodyEncoding?: 'text' | 'base64';
}

export interface InvokeResult {
    requestId: string;
    status: number;
    headers: HeaderMap;
    body: string;
    bodyEncoding: 'text' | 'base64';
    bodySize: number;
    bodyTruncated: boolean;
    durationMs: number;
    journey: RecordedEvent[];
}

// ---------- Recorded traffic ----------

export interface RequestSummary {
    id: string;
    time: string;
    method: string;
    url: string;
    status?: number;
    durationMs?: number;
    failed?: boolean;
}

export interface RequestDetail extends RequestSummary {
    events: RecordedEvent[];
}

// ---------- Events ----------

export const EVENTS_VERSION = 2;

/** Where a request is in the pipeline. */
export type StageInfo =
    | { kind: 'function'; event: EdgeEvent; runtime: FunctionRuntime; functionIds: string[] }
    | { kind: 'short-circuit'; event: EdgeEvent; runtime: FunctionRuntime; functionIds: string[] }
    | { kind: 'origin-fetch'; origin: string }
    | { kind: 'origin-response' }
    | { kind: 'final-response' };

/** Body snapshot fields, as captured by the pipeline (base64, capped). */
export interface BodySnapshot {
    body?: string;
    bodySize?: number;
    bodyTruncated?: boolean;
    bodyUnchanged?: boolean;
    contentType?: string;
}

export interface EventPayloads {
    /** First event on every connection: what the client is talking to. */
    'stream.hello': { apiVersion: number; version: string; seq: number; resumed: boolean };
    /** The client asked to resume from an event that is no longer buffered: refetch state. */
    'stream.reset': { reason: string };
    'request.started': { method: string; url: string; headers: HeaderMap } & BodySnapshot;
    'request.stage': { name: string; stage: StageInfo | null; uri?: string; status?: number | string; headers?: HeaderMap } & BodySnapshot;
    'request.completed': { status: number; headers: HeaderMap; durationMs?: number };
    'request.failed': { message: string };
    'build.succeeded': { file: string; runtime: FunctionRuntime };
    'build.failed': { file: string; runtime?: FunctionRuntime; message: string; line?: number; column?: number; snippet?: string };
    /** Another project was opened. */
    'project.opened': { name: string; dir: string; revision: string; diagnostics: Diagnostic[] };
    /** The open project was reloaded: saved through the API, edited on disk, or reloaded on request. */
    'project.changed': { name: string; dir: string; revision: string; source: 'api' | 'disk' | 'open'; diagnostics: Diagnostic[] };
    /** The manifest was edited on disk but can't be loaded; the previous version keeps running. */
    'project.invalid': { name: string; dir: string; revision: string; diagnostics: Diagnostic[] };
    /** The viewer headers file changed and was applied. */
    'viewer.changed': { name: string; dir: string };
    /** Functions, behaviors or their state changed: refetch the distribution. */
    'distribution.changed': Record<string, never>;
}

export type ApiEventType = keyof EventPayloads;

/** One event of the stream. */
export type ApiEvent<T extends ApiEventType = ApiEventType> = {
    [K in T]: { v: typeof EVENTS_VERSION; seq: number; time: string; type: K; requestId?: string; data: EventPayloads[K] };
}[T];

/** An event as recorded in history (GET /requests/:id, /invoke): no stream sequence number. */
export type RecordedEvent = {
    [K in ApiEventType]: { v: typeof EVENTS_VERSION; time: string; type: K; requestId?: string; data: EventPayloads[K] };
}[ApiEventType];
