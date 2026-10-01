import fs from 'fs';
import path from 'path';
import type { EdgeEvent, FunctionType } from '../api/contract';
import { HookUtility } from '../core/HookUtility';
import { ConfigLoader } from '../pipeline/ConfigLoader';
import { SCHEMA_URL } from './create';
import { ManifestError, ProjectExistsError } from './errors';
import { checkManifest, MANIFEST_FILE } from './loadProject';
import { formatManifest } from './revision';
import { EVENT_TYPES } from './schema';

/** A 2.x command line, as `cloudfrontize import` takes it (the same flags as 2.x). */
export interface LegacySetup {
    /** The folder 2.x served (`cloudfrontize ./www`). */
    directory?: string;
    edge?: string;
    cff?: string;
    origins?: string;
    headers?: string;
    env?: string;
    bake?: string;
    s3Origin?: string;
    s3Endpoint?: string;
    mode?: 'rest' | 'website';
}

export interface ImportResult {
    dir: string;
    manifestPath: string;
    /** What the import decided, and what needs a look (one sentence each). */
    notes: string[];
}

const VIEWER_EVENTS: EdgeEvent[] = ['viewer-request', 'viewer-response'];

// File names become ids: "addSecurityHeaders" → "add-security-headers"
const slug = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[^a-z0-9]+|-+$/g, '').slice(0, 64) || 'function';

/** The .js files of a 2.x --edge / --cff argument (a file, or a folder of files), in 2.x load order. */
function sourceFiles(target: string): string[] {
    const abs = path.resolve(target);
    if (!fs.existsSync(abs)) throw new Error(`${target} doesn't exist`);
    if (fs.statSync(abs).isFile()) return [abs];
    return fs.readdirSync(abs).filter(f => f.endsWith('.js')).sort().map(f => path.join(abs, f));
}

interface ImportedFunction {
    id: string;
    type: FunctionType;
    stage: EdgeEvent;
}

/**
 * Turns a 2.x setup into a project in `out`: origins (local folders are copied into the project),
 * behaviors, functions (copied by convention to functions/<kind>/<event>.<id>.js), and the headers,
 * env and bake files. 2.x ran every function on every path, so each one is attached to every
 * behavior, within what AWS allows: one function per event, and one kind on the viewer events.
 * @throws {ProjectExistsError} when `out` has content; {ManifestError} if the result is invalid.
 */
export function importLegacySetup(setup: LegacySetup, out: string, name?: string): ImportResult {
    const dir = path.resolve(out);
    const existed = fs.existsSync(dir);
    if (existed && fs.readdirSync(dir).some(f => f !== '.DS_Store' && f !== '.git')) throw new ProjectExistsError(dir, 'isn\'t empty');
    const notes: string[] = [];

    try {
        fs.mkdirSync(dir, { recursive: true });
        const copyFolder = (from: string, to: string) => {
            const abs = path.resolve(from);
            if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) throw new Error(`${from} isn't a folder`);
            fs.cpSync(abs, path.join(dir, to), { recursive: true });
        };

        // ---------- Origins and behaviors ----------
        const origins: Record<string, unknown>[] = [];
        let defaultOrigin: string | undefined;
        const behaviors: { pathPattern: string; origin: string; functions: Partial<Record<EdgeEvent, string>> }[] = [];

        if (setup.origins) {
            const config = ConfigLoader.load(setup.origins);
            for (const o of config.origins as any[]) {
                if (o.type === 's3') {
                    const origin: Record<string, unknown> = { id: o.id, type: 's3', bucket: o.bucket };
                    for (const k of ['region', 'endpoint', 'forcePathStyle', 'mode']) if (o[k] !== undefined) origin[k] = o[k];
                    if (o.endpoint && o.forcePathStyle === undefined) origin.forcePathStyle = true;
                    if (o.credentials?.profile) origin.credentials = { profile: o.credentials.profile };
                    else if (o.credentials?.accessKeyId) {
                        origin.credentials = { fromEnv: true };
                        notes.push(`Origin "${o.id}": the access keys in ${path.basename(setup.origins)} weren't copied (projects never store keys). Set AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY, or use "credentials": { "profile": "…" }.`);
                    }
                    origins.push(origin);
                } else {
                    const folder = `origins/${slug(o.id)}`;
                    copyFolder(o.directory ?? setup.directory ?? '.', folder);
                    origins.push({ id: o.id, type: 'local', path: folder, ...(o.mode ? { mode: o.mode } : {}) });
                    if (o.type === 'custom') notes.push(`Origin "${o.id}" was a "custom" origin, which 2.x served from local files: it's a local folder now.`);
                }
            }
            for (const b of config.behaviors) {
                if (b.pathPattern === '*' || b.pathPattern === '/*') { defaultOrigin ??= b.targetOriginId; continue; }
                behaviors.push({ pathPattern: b.pathPattern, origin: b.targetOriginId, functions: {} });
            }
        } else if (setup.s3Origin) {
            origins.push({
                id: 'bucket', type: 's3', bucket: setup.s3Origin, mode: setup.mode ?? 'rest',
                ...(setup.s3Endpoint ? { endpoint: setup.s3Endpoint, forcePathStyle: true } : {}),
            });
        } else if (setup.directory) {
            copyFolder(setup.directory, 'origins/www');
            origins.push({ id: 'website', type: 'local', path: 'origins/www', ...(setup.mode === 'website' ? { mode: 'website' } : {}) });
        } else {
            throw new Error('Nothing to serve: give the folder 2.x served, --origins or --s3-origin');
        }
        if (!defaultOrigin) {
            defaultOrigin = String(origins[0].id);
            if (setup.origins) notes.push(`No behavior matched every path ("*"), so the default behavior uses "${defaultOrigin}".`);
        }

        // ---------- Functions ----------
        const imported: ImportedFunction[] = [];
        const functions: Record<string, unknown> = {};
        const take = (target: string | undefined, type: FunctionType) => {
            if (!target) return;
            const kindFolder = path.join('functions', type === 'cloudfront-function' ? 'cloudfront' : 'lambda-edge');
            // Subfolders of a 2.x functions folder (helpers, node_modules) come along, so relative requires still resolve
            const abs = path.resolve(target);
            if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
                for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
                    if (!entry.isDirectory()) continue;
                    fs.cpSync(path.join(abs, entry.name), path.join(dir, kindFolder, entry.name), { recursive: true });
                    notes.push(`Copied ${entry.name}/ next to the functions (${kindFolder}/${entry.name}), for their requires.`);
                }
            }
            for (const file of sourceFiles(target)) {
                const content = fs.readFileSync(file, 'utf8');
                const base = path.basename(file, '.js');
                const stage = HookUtility.detectStage(content, path.basename(file)) as EdgeEvent;
                const declared = /exports\.hookType\s*=/.test(content) || EVENT_TYPES.some(e => base.toLowerCase().includes(e));
                if (!declared) notes.push(`${path.basename(file)} says neither its event (exports.hookType) nor has it in its name: like 2.x, it's assumed to be ${stage}.`);

                let id = slug(EVENT_TYPES.reduce((n, e) => n.replace(new RegExp(`^${e}[._-]?`, 'i'), ''), base) || base);
                while (functions[id]) id = `${id}-2`;
                const kind = type === 'cloudfront-function' ? 'cloudfront' : 'lambda-edge';
                const rel = `functions/${kind}/${stage}.${id}.js`;
                fs.mkdirSync(path.join(dir, 'functions', kind), { recursive: true });
                fs.copyFileSync(file, path.join(dir, rel));
                // 2.x CloudFront Functions were ES 5.1 (runtime 1.0)
                functions[id] = type === 'cloudfront-function' ? { type, runtime: 'cloudfront-js-1.0', file: rel } : { type, runtime: 'nodejs22.x', file: rel };
                imported.push({ id, type, stage });
            }
        };
        // CloudFront Functions first: in 2.x they ran before Lambda@Edge on viewer events
        take(setup.cff, 'cloudfront-function');
        take(setup.edge, 'lambda-edge');

        const slots: Partial<Record<EdgeEvent, string>> = {};
        const viewerKind = imported.find(f => f.stage === 'viewer-request')?.type ?? imported.find(f => f.stage === 'viewer-response')?.type;
        for (const fn of imported) {
            if (fn.type === 'cloudfront-function' && !VIEWER_EVENTS.includes(fn.stage)) {
                notes.push(`CloudFront Function "${fn.id}" was on ${fn.stage}, where AWS doesn't run CloudFront Functions: it's in the project but not attached.`);
            } else if (VIEWER_EVENTS.includes(fn.stage) && fn.type !== viewerKind) {
                notes.push(`"${fn.id}" isn't attached: AWS doesn't allow CloudFront Functions and Lambda@Edge on the viewer events of one behavior (kept the ${viewerKind === 'cloudfront-function' ? 'CloudFront Functions' : 'Lambda@Edge functions'}).`);
            } else if (slots[fn.stage]) {
                notes.push(`"${fn.id}" isn't attached: ${fn.stage} already runs "${slots[fn.stage]}" (AWS allows one function per event; 2.x ${fn.type === 'cloudfront-function' ? 'chained them' : 'used only the first'}).`);
            } else {
                slots[fn.stage] = fn.id;
            }
        }
        // 2.x ran functions on every path: every behavior gets them
        for (const b of behaviors) b.functions = { ...slots };
        if (behaviors.length && Object.keys(slots).length) notes.push(`2.x ran functions on every path, so each behavior runs them; remove the ones a behavior doesn't need.`);

        // ---------- Viewer simulation, env and bake files ----------
        const copyFile = (from: string | undefined, to: string) => {
            if (!from) return undefined;
            fs.mkdirSync(path.dirname(path.join(dir, to)), { recursive: true });
            fs.copyFileSync(path.resolve(from), path.join(dir, to));
            return to;
        };
        const viewer = copyFile(setup.headers, 'config/headers.json');
        const env = copyFile(setup.env, 'config/.env');
        const bake = copyFile(setup.bake, 'config/bake.env');

        const manifest = {
            $schema: SCHEMA_URL,
            version: 1,
            name: name ?? path.basename(dir),
            origins,
            ...(Object.keys(functions).length ? { functions } : {}),
            defaultBehavior: { origin: defaultOrigin, functions: slots },
            ...(behaviors.length ? { behaviors } : {}),
            ...(viewer ? { viewer: { headers: viewer } } : {}),
            ...(env ? { environment: { file: env } } : {}),
            ...(bake ? { bake: { file: bake } } : {}),
        };
        const manifestPath = path.join(dir, MANIFEST_FILE);
        const { manifest: valid, diagnostics } = checkManifest(manifest, dir);
        if (!valid || diagnostics.some(d => d.severity === 'error')) throw new ManifestError(manifestPath, diagnostics);
        fs.writeFileSync(manifestPath, formatManifest(manifest));
        fs.writeFileSync(path.join(dir, '.gitignore'), 'config/.env\n.env\ndist/\n');
        return { dir, manifestPath, notes };
    } catch (err) {
        if (!existed) fs.rmSync(dir, { recursive: true, force: true });
        else for (const entry of fs.readdirSync(dir)) if (entry !== '.git' && entry !== '.DS_Store') fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
        throw err;
    }
}
