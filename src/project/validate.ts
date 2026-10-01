import fs from 'fs';
import path from 'path';
import { CFF_LIMITS } from '../constants';
import { KeyValueStore } from '../core/KeyValueStore';
import { Diagnostic } from './errors';
import { AssociationMap, EVENT_TYPES, Manifest, VIEWER_EVENTS } from './schema';

/**
 * AWS association and quota rules that span several manifest fields. Runs after the schema has
 * parsed the manifest, so types are guaranteed here. Sources: CloudFront Developer Guide,
 * "Restrictions on all edge functions" and "Quotas".
 */

const MAX_CACHE_BEHAVIORS = 75; // "Cache behaviors per distribution" default quota
// "Path patterns can contain these characters: A-Z, a-z, 0-9, _ - . * $ / ~ " ' @ : + &"
const PATH_PATTERN_CHARS = /^[A-Za-z0-9_\-.*$/~"'@:+&?]+$/;

const isInside = (root: string, target: string) => {
    const rel = path.relative(root, target);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

export function validateManifest(manifest: Manifest, projectDir: string): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const add = (severity: Diagnostic['severity'], p: string, rule: string, message: string) =>
        diagnostics.push({ severity, path: p, rule, message });

    // Paths must stay inside the project and exist
    const checkFile = (p: string, rel: string | undefined, kind: 'file' | 'directory') => {
        if (!rel) return;
        const abs = path.resolve(projectDir, rel);
        if (!isInside(projectDir, abs)) {
            add('error', p, 'path-outside-project', `"${rel}" is outside the project folder`);
            return;
        }
        let stat: fs.Stats | null = null;
        try { stat = fs.statSync(abs); } catch { /* missing */ }
        if (!stat) add('error', p, 'path-missing', `"${rel}" doesn't exist`);
        else if (kind === 'file' && !stat.isFile()) add('error', p, 'path-not-file', `"${rel}" is not a file`);
        else if (kind === 'directory' && !stat.isDirectory()) add('error', p, 'path-not-directory', `"${rel}" is not a folder`);
    };

    // Origins: unique ids, local paths
    const originIds = new Set<string>();
    manifest.origins.forEach((origin, i) => {
        if (originIds.has(origin.id)) add('error', `/origins/${i}/id`, 'duplicate-origin', `Origin id "${origin.id}" is used more than once`);
        originIds.add(origin.id);
        if (origin.type === 'local') checkFile(`/origins/${i}/path`, origin.path, 'directory');
    });

    // Functions: files, CloudFront Function size
    for (const [id, fn] of Object.entries(manifest.functions)) {
        const p = `/functions/${id}/file`;
        checkFile(p, fn.file, 'file');
        if (fn.type === 'cloudfront-function') {
            try {
                const size = fs.statSync(path.resolve(projectDir, fn.file)).size;
                if (size > CFF_LIMITS.MAX_CODE_SIZE_BYTES) {
                    add(manifest.distribution.strict ? 'error' : 'warning', p, 'cff-size',
                        `CloudFront Functions are limited to 10 KB; "${fn.file}" is ${size} bytes`);
                }
            } catch { /* reported by checkFile */ }
        }
    }

    // Key value stores: AWS import format and quotas; CloudFront Functions runtime 2.0 only
    for (const [id, store] of Object.entries(manifest.keyValueStores)) {
        const p = `/keyValueStores/${id}/file`;
        const before = diagnostics.length;
        checkFile(p, store.file, 'file');
        if (diagnostics.length !== before) continue;
        for (const problem of KeyValueStore.check(path.resolve(projectDir, store.file), manifest.distribution.strict).problems) {
            add(problem.severity, p, 'kvs-file', problem.message);
        }
    }
    for (const [id, fn] of Object.entries(manifest.functions)) {
        if (fn.type !== 'cloudfront-function' || !fn.keyValueStore) continue;
        const p = `/functions/${id}/keyValueStore`;
        if (!manifest.keyValueStores[fn.keyValueStore]) add('error', p, 'unknown-kvs', `No key value store with id "${fn.keyValueStore}"`);
        if (fn.runtime !== 'cloudfront-js-2.0') add('error', p, 'kvs-runtime', 'Key value stores require CloudFront Functions runtime 2.0 ("cloudfront-js-2.0")');
    }

    // Behaviors: origin and function references, AWS association rules
    const used = new Set<string>();
    const checkBehavior = (base: string, origin: string, functions: AssociationMap) => {
        if (!originIds.has(origin)) add('error', `${base}/origin`, 'unknown-origin', `No origin with id "${origin}"`);

        const viewerTypes = new Map<string, string>(); // event → function type
        for (const event of EVENT_TYPES) {
            const fnId = functions[event];
            if (!fnId) continue;
            used.add(fnId);
            const fn = manifest.functions[fnId];
            const p = `${base}/functions/${event}`;
            if (!fn) {
                add('error', p, 'unknown-function', `No function with id "${fnId}"`);
                continue;
            }
            if (fn.type === 'cloudfront-function' && !VIEWER_EVENTS.includes(event)) {
                add('error', p, 'cff-viewer-events-only', `CloudFront Functions can only run on viewer events, not ${event}`);
            }
            if (VIEWER_EVENTS.includes(event)) viewerTypes.set(event, fn.type);
        }
        if (new Set(viewerTypes.values()).size > 1) {
            add('error', `${base}/functions`, 'no-mixed-viewer-functions',
                'CloudFront Functions and Lambda@Edge can\'t be combined in viewer events (viewer-request and viewer-response) of the same behavior');
        }
    };

    checkBehavior('/defaultBehavior', manifest.defaultBehavior.origin, manifest.defaultBehavior.functions);

    const patterns = new Set<string>();
    manifest.behaviors.forEach((behavior, i) => {
        const base = `/behaviors/${i}`;
        const pattern = behavior.pathPattern;
        if (pattern === '*' || pattern === '/*') {
            add('error', `${base}/pathPattern`, 'default-pattern', `"${pattern}" matches everything; configure it as defaultBehavior instead`);
        } else if (!PATH_PATTERN_CHARS.test(pattern)) {
            add('error', `${base}/pathPattern`, 'path-pattern-chars', `"${pattern}" contains characters AWS doesn't allow in path patterns`);
        }
        if (patterns.has(pattern)) add('error', `${base}/pathPattern`, 'duplicate-path-pattern', `Path pattern "${pattern}" is used by more than one behavior`);
        patterns.add(pattern);
        checkBehavior(base, behavior.origin, behavior.functions);
    });

    if (manifest.behaviors.length + 1 > MAX_CACHE_BEHAVIORS) {
        add('warning', '/behaviors', 'behavior-quota', `AWS allows ${MAX_CACHE_BEHAVIORS} cache behaviors per distribution by default; this project has ${manifest.behaviors.length + 1}`);
    }

    for (const id of Object.keys(manifest.functions)) {
        if (!used.has(id)) add('info', `/functions/${id}`, 'unused-function', `Function "${id}" isn't attached to any behavior`);
    }

    // Supporting files
    checkFile('/viewer/headers', manifest.viewer.headers, 'file');
    checkFile('/environment/file', manifest.environment.file, 'file');
    checkFile('/bake/file', manifest.bake.file, 'file');

    return diagnostics;
}
