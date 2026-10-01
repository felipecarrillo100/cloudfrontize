import { EVENT_TYPES } from '../project/schema';
import { ApiHost, objectBody } from './context';
import type { ControlAction, Distribution, DistributionBehavior, DistributionFunction, DistributionOrigin, EdgeEvent } from './contract';
import { ApiError } from './errors';
import { functionInfo } from './files';
import type { Router } from './router';

const ACTIONS: ControlAction[] = ['enable', 'disable', 'isolate', 'reset'];

const typeOf = (registryType: string) => (registryType === 'Lambda@Edge' ? 'lambda-edge' : 'cloudfront-function');

/** The distribution as the schematic shows it: functions, behaviors with their slots, origins. */
export function describeDistribution(host: ApiHost): Distribution {
    const runtime = host.runtime();
    const project = runtime.project;
    const dist = runtime.orchestrator.getDistribution();
    const origins: DistributionOrigin[] = (dist.origins || []).map((o: any) => {
        const { configFile, directory, credentials, ...rest } = o;
        return { ...rest, ...(directory && !rest.path ? { path: directory } : {}), ...(credentials ? { credentials: { configured: true } } : {}) };
    });

    if (project) {
        const functions: DistributionFunction[] = Object.keys(project.functions).map(id => {
            const info = functionInfo(host, project, id);
            return { id, type: info.type, runtime: info.runtime, file: info.file, path: info.path, disabled: info.disabled, build: info.build };
        });
        const behaviors: DistributionBehavior[] = [
            ...project.manifest.behaviors.map(b => ({ key: b.pathPattern, pathPattern: b.pathPattern, origin: b.origin, functions: { ...b.functions } })),
            { key: 'default', pathPattern: null, origin: project.manifest.defaultBehavior.origin, functions: { ...project.manifest.defaultBehavior.functions } }
        ];
        return { mode: 'project', project: { name: project.manifest.name, dir: project.dir, revision: project.revision }, functions, behaviors, origins };
    }

    // 2.x setup: hooks run on every path, so they all belong to the default behavior
    const errors = runtime.orchestrator.getBuildErrors();
    const functions: DistributionFunction[] = dist.functions.map((f: any) => ({
        id: f.id, type: typeOf(f.type), runtime: null, file: null, path: f.path, disabled: !!f.disabled,
        build: errors[f.path] ? { status: 'error', error: { message: String(errors[f.path].error ?? 'Build failed'), line: errors[f.path].line ?? null } } : { status: 'ok' }
    }));
    const slots: Partial<Record<EdgeEvent, string>> = {};
    for (const h of dist.hooks) {
        const stage = h.stage as EdgeEvent;
        if ((EVENT_TYPES as readonly string[]).includes(stage) && !slots[stage]) slots[stage] = h.id;
    }
    const routes = dist.behaviors.filter((b: any) => b.key !== 'default').map((b: any) => ({ key: b.pathPattern, pathPattern: b.pathPattern, origin: b.origin, functions: {} }));
    const fallback = dist.behaviors.find((b: any) => b.key === 'default');
    return {
        mode: 'legacy',
        project: null,
        functions,
        behaviors: [...routes, { key: 'default', pathPattern: null, origin: fallback?.origin ?? origins[0]?.id ?? 'default', functions: slots }],
        origins
    };
}

/** Distribution overview and function switches (enable, disable, isolate): what the schematic needs. */
export function registerDistributionRoutes(router: Router, host: ApiHost): void {
    router.get('/distribution', () => ({ body: describeDistribution(host) }));

    // Switch functions on and off for testing. Not saved: it lasts until the project reloads.
    router.post('/controls', ({ body }) => {
        const input = objectBody(body, 'Send { "action": "enable" | "disable" | "isolate" | "reset", "function"?: "<id>" }');
        const action = input.action as ControlAction;
        if (!ACTIONS.includes(action)) throw ApiError.badRequest(`"action" must be one of ${ACTIONS.join(', ')}`);
        const orchestrator = host.runtime().orchestrator;
        if (action === 'reset') {
            orchestrator.resetHooks();
        } else {
            const id = input.function;
            if (typeof id !== 'string' || !describeDistribution(host).functions.some(f => f.id === id)) throw ApiError.notFound(`No function "${id}"`);
            if (action === 'isolate') orchestrator.isolateHook(id);
            else orchestrator.toggleHook(id, action === 'disable');
        }
        return { body: describeDistribution(host) };
    });
}
