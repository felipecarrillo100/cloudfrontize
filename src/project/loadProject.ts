import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { Diagnostic, ManifestError } from './errors';
import { BehaviorDefinition, FunctionDefinition, Manifest, ManifestSchema, OriginDefinition } from './schema';
import { validateManifest } from './validate';
import { revisionOf } from './revision';
import { applySettings, Setting } from './settings';

export const MANIFEST_FILE = 'cloudfrontize.json';

export type ResolvedOrigin = OriginDefinition & { absolutePath?: string };
export type ResolvedFunction = FunctionDefinition & { id: string; absoluteFile: string };

/** A validated project with every path resolved against the project folder. */
export interface Project {
    dir: string;
    manifestPath: string;
    /** Revision of the manifest file this project was loaded from (see revision.ts). */
    revision: string;
    /** The manifest as written in the file (no defaults applied), for editing. */
    source: unknown;
    /** The manifest this project runs: the file, with defaults and any `--set` settings applied. */
    manifest: Manifest;
    /** The `--set` settings applied for this run (empty when none). */
    settings: string[];
    origins: ResolvedOrigin[];
    functions: Record<string, ResolvedFunction>;
    defaultBehavior: Manifest['defaultBehavior'];
    behaviors: BehaviorDefinition[];
    viewerHeadersFile?: string;
    envFile?: string;
    bakeFile?: string;
}

/** Resolves a project folder or a manifest file path to the manifest's absolute path. */
export function resolveManifestPath(target: string): string {
    const abs = path.resolve(target);
    return abs.toLowerCase().endsWith('.json') ? abs : path.join(abs, MANIFEST_FILE);
}

/** True when `target` is a project folder (contains cloudfrontize.json) or a manifest file. */
export function isProject(target: string | undefined): boolean {
    if (!target) return false;
    try {
        return fs.statSync(resolveManifestPath(target)).isFile();
    } catch {
        return false;
    }
}

const toPointer = (segments: PropertyKey[]) =>
    segments.length ? '/' + segments.map(s => String(s).replace(/~/g, '~0').replace(/\//g, '~1')).join('/') : '';

const schemaDiagnostics = (error: z.ZodError): Diagnostic[] =>
    error.issues.map(issue => ({ severity: 'error', path: toPointer(issue.path), rule: 'schema', message: issue.message }));

/**
 * Parses and validates a manifest object (no file access beyond the checks in validateManifest).
 * Returns every diagnostic; `manifest` is null when the schema rejects the input.
 */
export function checkManifest(input: unknown, projectDir: string): { manifest: Manifest | null; diagnostics: Diagnostic[] } {
    const parsed = ManifestSchema.safeParse(input);
    if (!parsed.success) return { manifest: null, diagnostics: schemaDiagnostics(parsed.error) };
    return { manifest: parsed.data, diagnostics: validateManifest(parsed.data, projectDir) };
}

export interface LoadOptions {
    /** Settings applied on top of the file for this run (`--set`); the file isn't changed. */
    set?: Setting[];
}

/**
 * Loads a project from its folder (or manifest path).
 * @throws {ManifestError} when the manifest can't be read, parsed, or breaks an AWS rule (also
 * when a `set` setting can't be applied, or makes it invalid).
 */
export function loadProject(target: string, options: LoadOptions = {}): { project: Project; diagnostics: Diagnostic[] } {
    const manifestPath = resolveManifestPath(target);
    const dir = path.dirname(manifestPath);

    let raw: string;
    try {
        raw = fs.readFileSync(manifestPath, 'utf8');
    } catch {
        throw new ManifestError(manifestPath, [{ severity: 'error', path: '', rule: 'manifest-missing', message: `No ${MANIFEST_FILE} found at ${manifestPath}` }]);
    }

    let input: unknown;
    try {
        input = JSON.parse(raw);
    } catch (err: any) {
        throw new ManifestError(manifestPath, [{ severity: 'error', path: '', rule: 'invalid-json', message: `Not valid JSON: ${err.message}` }]);
    }

    const settings = options.set ?? [];
    let effective = input;
    if (settings.length) {
        const applied = applySettings(input, settings);
        if (applied.diagnostics.length) throw new ManifestError(manifestPath, applied.diagnostics);
        effective = applied.manifest;
    }

    const { manifest, diagnostics } = checkManifest(effective, dir);
    if (!manifest || diagnostics.some(d => d.severity === 'error')) throw new ManifestError(manifestPath, diagnostics);

    const resolve = (rel?: string) => (rel ? path.resolve(dir, rel) : undefined);
    const project: Project = {
        dir,
        manifestPath,
        revision: revisionOf(raw),
        source: input,
        manifest,
        settings: settings.map(s => s.text),
        origins: manifest.origins.map(o => (o.type === 'local' ? { ...o, absolutePath: resolve(o.path) } : { ...o })),
        functions: Object.fromEntries(Object.entries(manifest.functions).map(([id, fn]) => [id, { ...fn, id, absoluteFile: resolve(fn.file)! }])),
        defaultBehavior: manifest.defaultBehavior,
        behaviors: manifest.behaviors,
        viewerHeadersFile: resolve(manifest.viewer.headers),
        envFile: resolve(manifest.environment.file),
        bakeFile: resolve(manifest.bake.file)
    };
    return { project, diagnostics };
}
