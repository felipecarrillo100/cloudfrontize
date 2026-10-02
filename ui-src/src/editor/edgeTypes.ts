/**
 * Type declarations given to the editor's JavaScript language service, so function code gets
 * completions and hover docs for CloudFront's event structures. Shapes follow the CloudFront
 * Developer Guide ("Lambda@Edge event structure", "CloudFront Functions event structure").
 * Lambda@Edge handlers get them from `exports.handler`; CloudFront Functions from a JSDoc
 * `@param {CloudFrontFunctionEvent} event` (the starter code has it).
 */
export const EDGE_TYPES = String.raw`
// ---------- Lambda@Edge ----------

/** A header as Lambda@Edge represents it: lowercase name → list of { key, value }. */
interface CloudFrontHeaders { [lowercaseName: string]: { key?: string; value: string }[] }

interface CloudFrontRequestBody {
  /** "read-only": the function may read it; "replace": the function returns a new body. */
  action: 'read-only' | 'replace';
  data: string;
  encoding: 'base64' | 'text';
  /** True when CloudFront truncated the body (40 KB viewer request, 1 MB origin request). */
  inputTruncated: boolean;
}

interface CloudFrontS3Origin { s3: { domainName: string; path: string; region: string; authMethod: 'origin-access-identity' | 'none'; customHeaders: CloudFrontHeaders } }
interface CloudFrontCustomOrigin { custom: { domainName: string; path: string; port: number; protocol: 'http' | 'https'; sslProtocols: string[]; readTimeout: number; keepaliveTimeout: number; customHeaders: CloudFrontHeaders } }

interface CloudFrontRequest {
  clientIp: string;
  method: string;
  /** The path, without the query string. */
  uri: string;
  /** The query string without "?" (read-only in origin-response and viewer-response). */
  querystring: string;
  headers: CloudFrontHeaders;
  /** Only in origin-request and origin-response. */
  origin?: CloudFrontS3Origin | CloudFrontCustomOrigin;
  /** Only when "Include body" is enabled. */
  body?: CloudFrontRequestBody;
}

interface CloudFrontResponse {
  status: string;
  statusDescription: string;
  headers: CloudFrontHeaders;
}

/** A response a request function generates (it short-circuits: CloudFront answers with it). */
interface CloudFrontResultResponse {
  status: string;
  statusDescription?: string;
  headers?: CloudFrontHeaders;
  body?: string;
  bodyEncoding?: 'text' | 'base64';
}

interface CloudFrontEventConfig {
  distributionDomainName: string;
  distributionId: string;
  eventType: 'viewer-request' | 'origin-request' | 'origin-response' | 'viewer-response';
  requestId: string;
}

/** The event of every Lambda@Edge trigger. \`cf.response\` exists in response events only. */
interface CloudFrontEvent {
  Records: [{ cf: { config: CloudFrontEventConfig; request: CloudFrontRequest; response: CloudFrontResponse } }];
}
type CloudFrontRequestEvent = CloudFrontEvent;
type CloudFrontResponseEvent = CloudFrontEvent;

interface LambdaContext {
  functionName: string;
  /** Milliseconds left before the 30 s limit. */
  getRemainingTimeInMillis(): number;
}

/** CommonJS exports of a Lambda@Edge function: \`exports.handler\` is what Lambda calls. */
declare var exports: {
  handler: (event: CloudFrontEvent, context: LambdaContext, callback: (error: unknown, result?: CloudFrontRequest | CloudFrontResponse | CloudFrontResultResponse) => void) => unknown;
  /** CloudFrontize 2.x: the event a file runs on, when it isn't in a project. */
  hookType?: 'viewer-request' | 'origin-request' | 'origin-response' | 'viewer-response';
  [name: string]: unknown;
};
declare var module: { exports: typeof exports };
declare function require(id: string): any;
declare var process: { env: Record<string, string | undefined>; platform: string; version: string };
declare var __dirname: string;
declare var __filename: string;

// ---------- CloudFront Functions ----------

interface CloudFrontFunctionValue {
  value: string;
  /** Present when the name is repeated: every value, in order. */
  multiValue?: { value: string }[];
}

interface CloudFrontFunctionRequest {
  method: string;
  uri: string;
  querystring: Record<string, CloudFrontFunctionValue>;
  headers: Record<string, CloudFrontFunctionValue>;
  cookies: Record<string, CloudFrontFunctionValue>;
}

interface CloudFrontFunctionResponse {
  statusCode: number;
  statusDescription?: string;
  headers?: Record<string, CloudFrontFunctionValue>;
  cookies?: Record<string, CloudFrontFunctionValue & { attributes?: string }>;
  /** Generated responses (viewer request) can carry a body. */
  body?: string | { data: string; encoding: 'text' | 'base64' };
}

interface CloudFrontFunctionEvent {
  version: '1.0';
  context: { distributionDomainName: string; distributionId: string; eventType: 'viewer-request' | 'viewer-response'; requestId: string };
  viewer: { ip: string };
  request: CloudFrontFunctionRequest;
  /** viewer-response only. */
  response: CloudFrontFunctionResponse;
}

/** CloudFront Functions runtime 2.0: \`import cf from 'cloudfront'\`. */
declare module 'cloudfront' {
  interface KeyValueStore {
    /** Rejects when the key doesn't exist: check with exists() first. */
    get(key: string, options?: { format: 'string' }): Promise<string>;
    get(key: string, options: { format: 'json' }): Promise<any>;
    get(key: string, options: { format: 'bytes' }): Promise<Uint8Array>;
    exists(key: string): Promise<boolean>;
    meta(): Promise<{ keyCount: number; creationDateTime: string; lastUpdatedDateTime: string }>;
  }
  const cf: {
    /** The key value store associated with this function (or the one with this id). */
    kvs(id?: string): KeyValueStore;
  };
  export default cf;
}
`
