import { z } from 'zod';

/**
 * The CloudFrontize project manifest (`cloudfrontize.json`).
 *
 * @namespace Backend
 * These zod schemas are the single source of truth for the manifest: they produce the TypeScript
 * types, validate manifests at load time, and generate the JSON Schema editors use for autocomplete
 * (`npm run schema` → schema/cloudfrontize.schema.json). Structural rules live here; AWS
 * association rules that span several fields live in validate.ts.
 */

export const EVENT_TYPES = ['viewer-request', 'origin-request', 'origin-response', 'viewer-response'] as const;
export type EventType = typeof EVENT_TYPES[number];
export const VIEWER_EVENTS: readonly EventType[] = ['viewer-request', 'viewer-response'];

const Id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/, {
    error: 'Use 1–64 letters, digits, ".", "_" or "-", starting with a letter or digit'
});
const RelativePath = z.string().min(1).describe('Path relative to the project folder');
const OriginMode = z.enum(['rest', 'website']).describe('S3 REST/OAC (default) or S3 website-hosting behavior');

const Distribution = z.strictObject({
    port: z.number().int().min(0).max(65535).default(3000),
    strict: z.boolean().default(false).describe('Fail requests that break AWS rules (headers, sizes, function combinations). Timing only warns.'),
    cors: z.boolean().default(false),
    spa: z.boolean().default(false).describe('Serve index.html (200) when the origin returns 404 or 403'),
    compression: z.boolean().default(true),
    etag: z.boolean().default(true),
    requestLogging: z.boolean().default(true)
});

const ProfileCredentials = z.strictObject({ profile: z.string().min(1).describe('AWS shared-config profile name') });
const EnvCredentials = z.strictObject({ fromEnv: z.literal(true).describe('Use the default AWS credential chain') });
const Credentials = z.union([ProfileCredentials, EnvCredentials], {
    error: 'Credentials must be { "profile": "<name>" } or { "fromEnv": true }. Don\'t put access keys in the manifest: it is meant to be committed.'
});

const LocalOrigin = z.strictObject({
    id: Id,
    type: z.literal('local'),
    path: RelativePath,
    mode: OriginMode.default('rest')
});

const S3Origin = z.strictObject({
    id: Id,
    type: z.literal('s3'),
    bucket: z.string().min(3).max(63),
    region: z.string().min(1).optional(),
    endpoint: z.url().optional().describe('Custom S3 endpoint, e.g. MinIO or LocalStack'),
    forcePathStyle: z.boolean().optional(),
    mode: OriginMode.default('rest'),
    credentials: Credentials.optional()
});

const Origin = z.discriminatedUnion('type', [LocalOrigin, S3Origin]);

const CloudFrontFunction = z.strictObject({
    type: z.literal('cloudfront-function'),
    runtime: z.enum(['cloudfront-js-1.0', 'cloudfront-js-2.0']).default('cloudfront-js-2.0'),
    file: RelativePath
});

const LambdaEdgeFunction = z.strictObject({
    type: z.literal('lambda-edge'),
    runtime: z.string().regex(/^nodejs\d+\.x$/, { error: 'Use a Node.js runtime identifier such as "nodejs22.x"' }).default('nodejs22.x'),
    file: RelativePath
});

const FunctionDefinition = z.discriminatedUnion('type', [CloudFrontFunction, LambdaEdgeFunction]);

/** Function associations of one cache behavior: at most one function per event type (AWS rule). */
const Associations = z.strictObject({
    'viewer-request': Id.optional(),
    'origin-request': Id.optional(),
    'origin-response': Id.optional(),
    'viewer-response': Id.optional()
});

const DefaultBehavior = z.strictObject({
    origin: Id,
    functions: Associations.prefault({})
});

const Behavior = z.strictObject({
    pathPattern: z.string().min(1).max(255),
    origin: Id,
    functions: Associations.prefault({})
});

export const ManifestSchema = z.strictObject({
    $schema: z.string().optional(),
    version: z.literal(1),
    name: z.string().min(1).max(128),
    distribution: Distribution.prefault({}),
    origins: z.array(Origin).min(1, { error: 'Add at least one origin' }),
    functions: z.record(Id, FunctionDefinition).prefault({}),
    defaultBehavior: DefaultBehavior,
    behaviors: z.array(Behavior).prefault([]),
    viewer: z.strictObject({ headers: RelativePath.optional().describe('Viewer simulation headers (JSON)') }).prefault({}),
    environment: z.strictObject({ file: RelativePath.optional().describe('Reserved AWS variables for Lambda@Edge (.env)') }).prefault({}),
    bake: z.strictObject({ file: RelativePath.optional().describe('__VAR__ values for production builds (.env format)') }).prefault({})
});

export type Manifest = z.output<typeof ManifestSchema>;
export type ManifestInput = z.input<typeof ManifestSchema>;
export type OriginDefinition = Manifest['origins'][number];
export type FunctionDefinition = Manifest['functions'][string];
export type BehaviorDefinition = Manifest['behaviors'][number];
export type AssociationMap = Manifest['defaultBehavior']['functions'];
