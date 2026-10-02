import fs from 'fs';
import path from 'path';
import { HookUtility } from '../core/HookUtility';
import { EdgeRunner } from '../core/EdgeRunner';
import { CFFRunner } from '../core/CFFRunner';

import { Telemetry } from './Telemetry';
import { CacheBehavior, HookType } from '../core/types';

export class HookRegistry {
    private hooks: any[] = [];
    private disabledHookIds: Set<string> = new Set();
    private buildErrors: Map<string, any> = new Map();
    private detachListeners: Array<() => void> = [];

    /**
     * @param behaviors - Project mode: behaviors with explicit function associations. One entry is
     *   listed per (function, event) attachment; a function attached to several behaviors shares its id.
     */
    constructor(private edgeRunner: EdgeRunner | null, private cffRunner: CFFRunner | null, private telemetry: Telemetry, private behaviors: CacheBehavior[] = []) {
        this._initialize();
        this._setupListeners();
    }

    private _initialize() {
        const hooks: any[] = [];

        // Manifest mode: the project lists the functions; behaviors say which events they run on
        const edgeFiles: any[] = this.edgeRunner?.options?.files || [];
        const cffFiles: any[] = this.cffRunner?.options?.files || [];
        if (this.edgeRunner?.options?.files || this.cffRunner?.options?.files) {
            const byId = new Map<string, { type: string; path: string }>();
            for (const f of edgeFiles) byId.set(f.id, { type: 'Lambda@Edge', path: f.path });
            for (const f of cffFiles) byId.set(f.id, { type: 'CloudFront Function', path: f.path });
            const seen = new Set<string>();
            for (const behavior of this.behaviors) {
                for (const [stage, ids] of Object.entries(behavior.functions || {}) as [HookType, string[]][]) {
                    for (const id of ids) {
                        const fn = byId.get(id);
                        if (!fn || seen.has(`${id}|${stage}`)) continue;
                        seen.add(`${id}|${stage}`);
                        hooks.push({ id, type: fn.type, path: fn.path, stage });
                    }
                }
            }
            this.hooks = hooks;
            return;
        }
        
        // 1. Lambda@Edge Discovery
        const edgePath = this.edgeRunner?.getRunnerPath?.();
        if (edgePath && fs.existsSync(edgePath)) {
            if (fs.lstatSync(edgePath).isFile()) {
                const content = fs.readFileSync(edgePath, 'utf8');
                const stage = HookUtility.detectStage(content, path.basename(edgePath));
                hooks.push({ id: `${stage}-le-0`, type: 'Lambda@Edge', path: edgePath, stage });
            } else if (fs.lstatSync(edgePath).isDirectory()) {
                const files = fs.readdirSync(edgePath).filter(f => f.endsWith('.js')).sort();
                const counts: Record<string, number> = {};
                files.forEach((f) => {
                    const filePath = path.join(edgePath, f);
                    const content = fs.readFileSync(filePath, 'utf8');
                    const stage = HookUtility.detectStage(content, f);
                    const idx = counts[stage] || 0;
                    hooks.push({ id: `${stage}-le-${idx}`, type: 'Lambda@Edge', path: filePath, stage });
                    counts[stage] = idx + 1;
                });
            }
        }

        // 2. CloudFront Function Discovery
        const cffPath = this.cffRunner?.getRunnerPath?.();
        if (cffPath) {
            if (fs.existsSync(cffPath) && fs.lstatSync(cffPath).isFile()) {
                const content = fs.readFileSync(cffPath, 'utf8');
                const stage = HookUtility.detectStage(content, path.basename(cffPath));
                hooks.push({ id: `${stage}-cff-0`, type: 'CloudFront Function', path: cffPath, stage });
            } else if (fs.existsSync(cffPath) && fs.lstatSync(cffPath).isDirectory()) {
                const files = fs.readdirSync(cffPath).filter(f => f.endsWith('.js')).sort();
                const counts: Record<string, number> = {};
                files.forEach((f) => {
                    const filePath = path.join(cffPath, f);
                    const content = fs.readFileSync(filePath, 'utf8');
                    const stage = HookUtility.detectStage(content, f);
                    const idx = counts[stage] || 0;
                    hooks.push({ id: `${stage}-cff-${idx}`, type: 'CloudFront Function', path: filePath, stage });
                    counts[stage] = idx + 1;
                });
            }
        }
        
        this.hooks = hooks;
    }

    private _setupListeners() {
        const runners = [this.edgeRunner, this.cffRunner].filter(Boolean);
        for (const runner of runners) {
            const onError = (data: any) => {
                this.buildErrors.set(data.path, data);
                this.telemetry.broadcast({
                    id: 'SYSTEM_BUILD',
                    type: 'error',
                    details: data
                });
            };
            const onSuccess = (data: any) => {
                this.buildErrors.delete(data.file);
                this.telemetry.broadcast({
                    id: 'SYSTEM_BUILD',
                    type: 'success',
                    details: { name: 'Build Success', ...data }
                });
            };
            runner!.on('build_error', onError);
            runner!.on('build_success', onSuccess);
            this.detachListeners.push(() => {
                runner!.off('build_error', onError);
                runner!.off('build_success', onSuccess);
            });
        }
    }

    /** Detaches from the runners so a disposed project stops reporting builds. */
    public dispose(): void {
        for (const detach of this.detachListeners) detach();
        this.detachListeners = [];
    }

    public getAllHooks() {
        return this.hooks;
    }

    public getActiveHooks(type: string, stage: string) {
        return this.hooks.filter(h => h.type === type && h.stage === stage && !this.disabledHookIds.has(h.id));
    }

    public getDisabledHookIds() {
        return Array.from(this.disabledHookIds);
    }

    public hasDisabledHook(id: string) {
        return this.disabledHookIds.has(id);
    }

    public getBuildErrors(): Record<string, any> {
        return Object.fromEntries(this.buildErrors);
    }

    public hasBuildError(path: string): boolean {
        return this.buildErrors.has(path);
    }

    public getBuildError(path: string): any {
        return this.buildErrors.get(path);
    }

    public toggleHook(id: string, disabled: boolean): void {
        if (disabled) this.disabledHookIds.add(id);
        else this.disabledHookIds.delete(id);
    }

    public resetHooks(): void {
        this.disabledHookIds.clear();
    }

    public disableAllHooks(disable: boolean = true): void {
        if (disable) {
            for (const h of this.hooks) {
                this.disabledHookIds.add(h.id);
            }
        } else {
            this.disabledHookIds.clear();
        }
    }

    public isolateHook(id: string): void {
        this.disabledHookIds.clear();
        for (const h of this.hooks) {
            if (h.id !== id) this.disabledHookIds.add(h.id);
        }
    }
}
