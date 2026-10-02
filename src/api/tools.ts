import fs from 'fs';
import path from 'path';
import { CodeProcessor } from '../core/CodeProcessor';
import { EditorUtility } from '../core/EditorUtility';
import { ApiHost, editManifest, objectBody, requireProject } from './context';
import type { OriginCheck, ProductionCode, ProductionLevel } from './contract';
import { describeDistribution } from './distribution';
import { ApiError } from './errors';
import type { Router } from './router';

const LEVELS: ProductionLevel[] = ['baked', 'minified', 'uglified'];

/** Function and origin tools for the schematic's menus: open in an editor, production build, connection test. */
export function registerToolRoutes(router: Router, host: ApiHost): void {
    const findFunction = (id: string) => {
        const fn = describeDistribution(host).functions.find(f => f.id === id);
        if (!fn) throw ApiError.notFound(`No function "${id}"`);
        return fn;
    };

    // Opens the function's file in the local editor (VS Code if installed, else the system default)
    router.post('/functions/:id/open-in-editor', ({ params }) => {
        const fn = findFunction(params.id);
        if (!fs.existsSync(fn.path)) throw ApiError.notFound(`${fn.file ?? fn.path} doesn't exist`);
        EditorUtility.open(fn.path);
        return {};
    });

    // The code as it would be deployed: __VAR__ values baked in, optionally minified or uglified
    router.get('/functions/:id/production', async ({ params, query }) => {
        const fn = findFunction(params.id);
        const level = (query.get('level') ?? 'baked') as ProductionLevel;
        if (!LEVELS.includes(level)) throw ApiError.badRequest(`"level" must be one of ${LEVELS.join(', ')}`);
        if (!fs.existsSync(fn.path)) throw ApiError.notFound(`${fn.file ?? fn.path} doesn't exist`);
        const runtime = host.runtime();
        const isCff = fn.type === 'cloudfront-function';
        const bakeVars = (isCff ? runtime.cffRunner : runtime.edgeRunner)?.getBakeVars() ?? {};
        try {
            const code = await CodeProcessor.process(fs.readFileSync(fn.path, 'utf8'), isCff ? 'cff' : 'edge', level, bakeVars);
            const body: ProductionCode = { level, code };
            return { body };
        } catch (err: any) {
            throw new ApiError(422, 'build-failed', `Can't build ${fn.id}: ${err.message}`);
        }
    });

    // Adds an origin. A local origin gets its folder (origins/<id>) with a starter page when it doesn't exist.
    router.post('/origins', async ({ body }) => {
        const project = requireProject(host);
        const input = objectBody(body, 'Send { "id", "type": "local" | "s3", ...origin settings }');
        if (typeof input.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(input.id)) throw ApiError.badRequest('"id" must be 1–64 letters, digits, ".", "_" or "-", starting with a letter or digit');
        if (project.manifest.origins.some(o => o.id === input.id)) throw ApiError.conflict(`An origin "${input.id}" already exists`);
        const origin: Record<string, unknown> = { ...input };
        let created: string | null = null;
        if (input.type === 'local') {
            origin.path = typeof input.path === 'string' ? input.path : `origins/${input.id}`;
            const abs = path.resolve(project.dir, String(origin.path));
            if (!fs.existsSync(abs)) {
                fs.mkdirSync(abs, { recursive: true });
                fs.writeFileSync(path.join(abs, 'index.html'), `<!DOCTYPE html>\n<html lang="en"><head><meta charset="UTF-8"><title>${input.id}</title></head>\n<body><h1>${input.id}</h1><p>Served by the local origin "${input.id}".</p></body></html>\n`);
                created = abs;
            }
        }
        try {
            const result = await editManifest(host, m => { m.origins = [...(m.origins ?? []), origin]; }, typeof input.revision === 'string' ? input.revision : undefined);
            return { status: 201, body: result };
        } catch (err) {
            if (created) fs.rmSync(created, { recursive: true, force: true });
            throw err;
        }
    });

    // Test connection: a local folder exists; an S3 bucket answers HeadBucket with these credentials
    router.post('/origins/:id/check', async ({ params }) => {
        const provider = host.runtime().providers[params.id];
        if (!provider) throw ApiError.notFound(`No origin "${params.id}"`);
        const body: OriginCheck = await provider.check();
        return { body };
    });
}
