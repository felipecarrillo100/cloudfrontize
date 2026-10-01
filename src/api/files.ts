import fs from 'fs';
import os from 'os';
import path from 'path';
import { KeyValueStore } from '../core/KeyValueStore';
import { HeaderParser } from '../headerParser';
import { conventionalFile, staticCheck, starterCode } from '../project/functions';
import type { Attachment, BuildResult, FunctionInfo, FunctionType } from './contract';
import type { Project } from '../project/loadProject';
import { EVENT_TYPES, EventType } from '../project/schema';
import { ApiHost, baseRevisionOf, editManifest, objectBody, readFile, requireProject, writeChecked } from './context';
import { ApiError } from './errors';
import type { Router } from './router';

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const FUNCTION_TYPES: FunctionType[] = ['cloudfront-function', 'lambda-edge'];
/** How long a save waits for the emulator to rebuild the function before falling back to a static check. */
const BUILD_WAIT_MS = 4000;

export type { Attachment, FunctionInfo } from './contract';

const behaviorsOf = (project: Project) => [
    { key: 'default', functions: project.manifest.defaultBehavior.functions },
    ...project.manifest.behaviors.map(b => ({ key: b.pathPattern, functions: b.functions }))
];

function attachmentsOf(project: Project, id: string): Attachment[] {
    const out: Attachment[] = [];
    for (const b of behaviorsOf(project)) {
        for (const event of EVENT_TYPES) if (b.functions[event] === id) out.push({ behavior: b.key, event });
    }
    return out;
}

export function functionInfo(host: ApiHost, project: Project, id: string): FunctionInfo {
    const fn = project.functions[id];
    if (!fn) throw ApiError.notFound(`No function "${id}" in the project`);
    const attachments = attachmentsOf(project, id);
    const exists = fs.existsSync(fn.absoluteFile);
    const orchestrator = host.runtime().orchestrator;
    const error = orchestrator.getBuildErrors()[fn.absoluteFile];
    const registered = orchestrator.getDistribution().functions.find((f: any) => f.id === id);

    let build: FunctionInfo['build'];
    if (!exists) build = { status: 'missing', error: { message: `${fn.file} doesn't exist`, line: null } };
    else if (attachments.length === 0) build = { status: 'unused' };
    else if (error) build = { status: 'error', error: { message: String(error.error ?? 'Build failed'), line: error.line ?? null, column: error.column ?? null } };
    else build = { status: 'ok' };

    return {
        id,
        type: fn.type,
        runtime: fn.runtime,
        file: fn.file,
        path: fn.absoluteFile,
        ...(fn.type === 'cloudfront-function' && fn.keyValueStore ? { keyValueStore: fn.keyValueStore } : {}),
        attachments,
        disabled: !!registered?.disabled,
        size: exists ? fs.statSync(fn.absoluteFile).size : null,
        build
    };
}

/**
 * Resolves with the build result the emulator reports for `file` (it rebuilds when the file changes),
 * or null after `ms`. Listen before writing, so the result can't be missed.
 */
function nextBuild(host: ApiHost, file: string, ms = BUILD_WAIT_MS): { result: Promise<Omit<BuildResult, 'sizeLimit'> | null>; cancel: () => void } {
    const runtime = host.runtime();
    const runners = [runtime.edgeRunner, runtime.cffRunner].filter(Boolean) as any[];
    let cancel = () => {};
    const result = new Promise<Omit<BuildResult, 'sizeLimit'> | null>(resolve => {
        const done = (value: Omit<BuildResult, 'sizeLimit'> | null) => { cancel(); resolve(value); };
        const onSuccess = (d: any) => {
            if (d.file !== file) return;
            done({ status: 'ok', checkedBy: 'runtime', size: d.size ?? 0, errors: [], warnings: d.warnings ?? [] });
        };
        const onError = (d: any) => {
            if ((d.path ?? d.file) !== file) return;
            done({ status: 'error', checkedBy: 'runtime', size: 0, errors: [{ message: String(d.error ?? 'Build failed'), line: d.line ?? null, column: d.column ?? null }], warnings: [] });
        };
        const timer = setTimeout(() => done(null), ms);
        for (const r of runners) { r.on('build_success', onSuccess); r.on('build_error', onError); }
        cancel = () => {
            clearTimeout(timer);
            for (const r of runners) { r.off('build_success', onSuccess); r.off('build_error', onError); }
        };
    });
    return { result, cancel };
}

/** Builds the result of a save: what the emulator reported, or a static check for functions it doesn't load. */
async function buildAfterWrite(host: ApiHost, project: Project, id: string, write: () => string): Promise<{ revision: string; build: BuildResult }> {
    const fn = project.functions[id];
    const loaded = attachmentsOf(project, id).length > 0;
    const pending = loaded ? nextBuild(host, fn.absoluteFile) : null;
    let revision: string;
    try {
        revision = write();
    } catch (err) {
        pending?.cancel();
        throw err;
    }
    const content = fs.readFileSync(fn.absoluteFile, 'utf8');
    const fromRuntime = pending ? await pending.result : null;
    const check = staticCheck(fn.type, fn.runtime, fn.absoluteFile, content, !!project.manifest.distribution.strict);
    // The static check always provides the size limit and, for CloudFront Functions, the same rules the runner applies
    const build: BuildResult = fromRuntime ? { ...fromRuntime, size: check.size, sizeLimit: check.sizeLimit } : check;
    return { revision, build };
}

function behaviorEntry(manifest: Record<string, any>, behavior: string): Record<string, any> {
    if (behavior === 'default') {
        manifest.defaultBehavior ??= {};
        return manifest.defaultBehavior;
    }
    const found = (manifest.behaviors ?? []).find((b: any) => b.pathPattern === behavior);
    if (!found) throw ApiError.notFound(`No behavior with path pattern "${behavior}"`);
    return found;
}

const eventParam = (value: unknown): EventType => {
    if (!(EVENT_TYPES as readonly unknown[]).includes(value)) throw ApiError.badRequest(`"event" must be one of ${EVENT_TYPES.join(', ')}`);
    return value as EventType;
};

const idParam = (value: unknown, what = 'id'): string => {
    if (typeof value !== 'string' || !ID.test(value)) throw ApiError.badRequest(`"${what}" must be 1–64 letters, digits, ".", "_" or "-", starting with a letter or digit`);
    return value;
};

/** Function, key value store and viewer-simulation routes of the API v2. */
export function registerFileRoutes(router: Router, host: ApiHost): void {
    // ---------- Functions ----------

    router.get('/functions', () => {
        const project = requireProject(host);
        return { body: { items: Object.keys(project.functions).map(id => functionInfo(host, project, id)), revision: project.revision } };
    });

    router.get('/functions/:id', ({ params }) => {
        const project = requireProject(host);
        const info = functionInfo(host, project, params.id);
        const source = readFile(info.path);
        return { body: { ...info, source } };
    });

    // Save a function's code. Answers with the build result, so editors can show problems right away.
    router.put('/functions/:id/source', async ({ params, body, req }) => {
        const project = requireProject(host);
        const info = functionInfo(host, project, params.id);
        const input = objectBody(body, 'Send { "content": "<code>", "revision": "<revision you edited>" }');
        if (typeof input.content !== 'string') throw ApiError.badRequest('"content" must be the function code as a string');
        const base = baseRevisionOf(input, req.headers, true);
        const { revision, build } = await buildAfterWrite(host, project, params.id, () => writeChecked(info.path, input.content, base));
        return { body: { revision, build } };
    });

    // Create a function: its file (starter code or `code`), its manifest entry, and optionally its slot
    router.post('/functions', async ({ body }) => {
        const project = requireProject(host);
        const input = objectBody(body, 'Send { "id", "type", "event", "behavior"?, "runtime"?, "code"? }');
        const id = idParam(input.id);
        if (!FUNCTION_TYPES.includes(input.type)) throw ApiError.badRequest(`"type" must be one of ${FUNCTION_TYPES.join(', ')}`);
        const type = input.type as FunctionType;
        const event = eventParam(input.event);
        if (project.functions[id]) throw ApiError.conflict(`A function "${id}" already exists`);
        const runtime = typeof input.runtime === 'string' ? input.runtime : (type === 'cloudfront-function' ? 'cloudfront-js-2.0' : 'nodejs22.x');
        const file = typeof input.file === 'string' ? input.file : conventionalFile(type, event, id);
        const abs = path.resolve(project.dir, file);
        if (fs.existsSync(abs)) throw ApiError.conflict(`${file} already exists`, { file });
        const code = typeof input.code === 'string' ? input.code : starterCode(type, runtime, event);

        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, code, { flag: 'wx' });
        let result;
        try {
            result = await editManifest(host, m => {
                m.functions ??= {};
                m.functions[id] = { type, runtime, file, ...(type === 'cloudfront-function' && typeof input.keyValueStore === 'string' ? { keyValueStore: input.keyValueStore } : {}) };
                if (input.behavior !== undefined) {
                    const b = behaviorEntry(m, String(input.behavior));
                    b.functions ??= {};
                    if (b.functions[event] && !input.replace) throw ApiError.conflict(`${event} of behavior "${input.behavior}" already runs "${b.functions[event]}" (send "replace": true to swap it)`);
                    b.functions[event] = id;
                }
            }, typeof input.revision === 'string' ? input.revision : undefined);
        } catch (err) {
            fs.rmSync(abs, { force: true });
            throw err;
        }
        const now = requireProject(host);
        const build = staticCheck(type, runtime, abs, code, !!now.manifest.distribution.strict);
        return { status: 201, body: { function: functionInfo(host, now, id), revision: result.revision, diagnostics: result.diagnostics, build } };
    });

    // Rename a function (its id, and its file when it follows the naming convention), or change its runtime / store
    router.patch('/functions/:id', async ({ params, body }) => {
        const project = requireProject(host);
        const info = functionInfo(host, project, params.id);
        const input = objectBody(body, 'Send any of { "id", "runtime", "keyValueStore" }');
        const newId = input.id !== undefined ? idParam(input.id) : info.id;
        if (newId !== info.id && project.functions[newId]) throw ApiError.conflict(`A function "${newId}" already exists`);

        // A conventional file name (`<event>.<id>.js`) follows the id
        let newFile = info.file;
        const suffix = `.${info.id}.js`;
        if (newId !== info.id && input.renameFile !== false && path.basename(info.file).endsWith(suffix)) {
            newFile = path.join(path.dirname(info.file), path.basename(info.file).slice(0, -suffix.length) + `.${newId}.js`).split(path.sep).join('/');
        }
        const newAbs = path.resolve(project.dir, newFile);
        if (newFile !== info.file) {
            if (fs.existsSync(newAbs)) throw ApiError.conflict(`${newFile} already exists`, { file: newFile });
            fs.renameSync(info.path, newAbs);
        }
        let result;
        try {
            result = await editManifest(host, m => {
                const entry = { ...m.functions[info.id], file: newFile };
                if (typeof input.runtime === 'string') entry.runtime = input.runtime;
                if (input.keyValueStore === null) delete entry.keyValueStore;
                else if (typeof input.keyValueStore === 'string') entry.keyValueStore = input.keyValueStore;
                if (newId !== info.id) {
                    // Keep the key order of the manifest
                    m.functions = Object.fromEntries(Object.entries(m.functions).map(([k, v]) => (k === info.id ? [newId, entry] : [k, v])));
                    for (const b of [m.defaultBehavior, ...(m.behaviors ?? [])]) {
                        for (const event of EVENT_TYPES) if (b?.functions?.[event] === info.id) b.functions[event] = newId;
                    }
                } else {
                    m.functions[info.id] = entry;
                }
            }, typeof input.revision === 'string' ? input.revision : undefined);
        } catch (err) {
            if (newFile !== info.file) fs.renameSync(newAbs, info.path);
            throw err;
        }
        return { body: { function: functionInfo(host, requireProject(host), newId), revision: result.revision, diagnostics: result.diagnostics } };
    });

    // Remove a function from the project (detaching it everywhere); `?deleteFile=true` also deletes its file
    router.delete('/functions/:id', async ({ params, query }) => {
        const project = requireProject(host);
        const info = functionInfo(host, project, params.id);
        const result = await editManifest(host, m => {
            delete m.functions[info.id];
            for (const b of [m.defaultBehavior, ...(m.behaviors ?? [])]) {
                for (const event of EVENT_TYPES) if (b?.functions?.[event] === info.id) delete b.functions[event];
            }
        }, query.get('revision') ?? undefined);
        const deleteFile = query.get('deleteFile') === 'true';
        if (deleteFile) fs.rmSync(info.path, { force: true });
        return { body: { revision: result.revision, diagnostics: result.diagnostics, fileDeleted: deleteFile } };
    });

    // Attach a function to a behavior's event (replacing what ran there), or detach it
    router.put('/behaviors/:behavior/functions/:event', async ({ params, body }) => {
        const event = eventParam(params.event);
        const input = objectBody(body, 'Send { "function": "<id>" }');
        const id = idParam(input.function, 'function');
        if (!requireProject(host).functions[id]) throw ApiError.notFound(`No function "${id}" in the project`);
        const result = await editManifest(host, m => {
            const b = behaviorEntry(m, params.behavior);
            b.functions ??= {};
            b.functions[event] = id;
        }, typeof input.revision === 'string' ? input.revision : undefined);
        return { body: { revision: result.revision, diagnostics: result.diagnostics } };
    });

    router.delete('/behaviors/:behavior/functions/:event', async ({ params, query }) => {
        const event = eventParam(params.event);
        const result = await editManifest(host, m => {
            const b = behaviorEntry(m, params.behavior);
            if (!b.functions?.[event]) throw ApiError.notFound(`${event} of behavior "${params.behavior}" has no function`);
            delete b.functions[event];
        }, query.get('revision') ?? undefined);
        return { body: { revision: result.revision, diagnostics: result.diagnostics } };
    });

    // ---------- Key value stores ----------

    const storeInfo = (project: Project, id: string) => {
        const entry = project.manifest.keyValueStores[id];
        if (!entry) throw ApiError.notFound(`No key value store "${id}" in the project`);
        const abs = path.resolve(project.dir, entry.file);
        const file = readFile(abs);
        const { entries, problems } = file ? KeyValueStore.checkContent(file.content, !!project.manifest.distribution.strict) : { entries: new Map(), problems: [{ severity: 'error', message: `${entry.file} doesn't exist` }] };
        const usedBy = Object.values(project.functions).filter(f => f.type === 'cloudfront-function' && f.keyValueStore === id).map(f => f.id);
        return { id, file: entry.file, path: abs, keyCount: entries.size, size: file ? Buffer.byteLength(file.content) : null, usedBy, problems, source: file };
    };

    router.get('/kvs', () => {
        const project = requireProject(host);
        return { body: { items: Object.keys(project.manifest.keyValueStores).map(id => { const { source, ...rest } = storeInfo(project, id); return rest; }) } };
    });

    router.get('/kvs/:id', ({ params }) => ({ body: storeInfo(requireProject(host), params.id) }));

    // Save a store's file (AWS import format). Invalid content is refused; the emulator reloads valid stores.
    router.put('/kvs/:id', ({ params, body, req }) => {
        const project = requireProject(host);
        const info = storeInfo(project, params.id);
        const input = objectBody(body, 'Send { "content": "<file content>", "revision": "<revision you edited>" }');
        if (typeof input.content !== 'string') throw ApiError.badRequest('"content" must be the file content as a string');
        const base = baseRevisionOf(input, req.headers, true);
        const { entries, problems } = KeyValueStore.checkContent(input.content, !!project.manifest.distribution.strict);
        if (problems.some(p => p.severity === 'error')) throw new ApiError(422, 'invalid-kvs', 'The key value store has errors', { problems });
        const revision = writeChecked(info.path, input.content, base);
        return { body: { revision, keyCount: entries.size, problems } };
    });

    router.post('/kvs', async ({ body }) => {
        const project = requireProject(host);
        const input = objectBody(body, 'Send { "id": "<store id>" }');
        const id = idParam(input.id);
        if (project.manifest.keyValueStores[id]) throw ApiError.conflict(`A key value store "${id}" already exists`);
        const file = typeof input.file === 'string' ? input.file : `kvs/${id}.json`;
        const abs = path.resolve(project.dir, file);
        if (fs.existsSync(abs)) throw ApiError.conflict(`${file} already exists`, { file });
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, '{\n  "data": []\n}\n', { flag: 'wx' });
        try {
            const result = await editManifest(host, m => {
                m.keyValueStores ??= {};
                m.keyValueStores[id] = { file };
            }, typeof input.revision === 'string' ? input.revision : undefined);
            return { status: 201, body: { ...storeInfo(requireProject(host), id), revision: result.revision } };
        } catch (err) {
            fs.rmSync(abs, { force: true });
            throw err;
        }
    });

    // ---------- Viewer simulation (headers CloudFront and the viewer send) ----------

    router.get('/viewer/headers', () => {
        const project = requireProject(host);
        const file = project.manifest.viewer.headers ?? null;
        const content = file ? readFile(path.resolve(project.dir, file)) : null;
        return { body: { file, content: content?.content ?? null, revision: content?.revision ?? null } };
    });

    // Save the viewer headers file; a project without one gets config/headers.json
    router.put('/viewer/headers', async ({ body, req }) => {
        const project = requireProject(host);
        const input = objectBody(body, 'Send { "content": "<JSON text>", "revision": "<revision you edited>" | null }');
        if (typeof input.content !== 'string') throw ApiError.badRequest('"content" must be the file content (JSON text)');
        const base = baseRevisionOf(input, req.headers, true);

        // Validate exactly as the server will read it
        const probe = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cfz-headers-')), 'headers.json');
        try {
            fs.writeFileSync(probe, input.content);
            new HeaderParser().load(probe);
        } catch (err: any) {
            throw new ApiError(422, 'invalid-viewer-headers', String(err.message).replace(probe, 'headers file'));
        } finally {
            fs.rmSync(path.dirname(probe), { recursive: true, force: true });
        }

        const configured = project.manifest.viewer.headers;
        const file = configured ?? 'config/headers.json';
        const revision = writeChecked(path.resolve(project.dir, file), input.content, base);
        if (!configured) await editManifest(host, m => { m.viewer = { ...(m.viewer ?? {}), headers: file }; });
        return { body: { file, revision } };
    });
}
