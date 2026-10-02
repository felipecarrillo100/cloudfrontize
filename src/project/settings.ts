import { Diagnostic } from './errors';

/**
 * `--set path=value`: changes one manifest setting for a run, without touching the file.
 *
 * The path is dot-separated, from the top of cloudfrontize.json: `distribution.strict`,
 * `origins.assets.bucket` (an origin by id, or by index: `origins.0.bucket`),
 * `behaviors.1.origin` (behaviors by index), `functions.router.runtime`.
 * The value is JSON when it parses as JSON (`true`, `3005`, `{"profile":"dev"}`), a string otherwise.
 */
export interface Setting {
    /** The expression as given, for messages. */
    text: string;
    path: string[];
    value: unknown;
}

export function parseSetting(text: string): Setting {
    const eq = text.indexOf('=');
    const key = eq === -1 ? '' : text.slice(0, eq).trim();
    if (!key) throw new Error(`--set ${text}: expected path=value, e.g. --set distribution.strict=true`);
    const path = key.split('.');
    if (path.some(s => s === '')) throw new Error(`--set ${text}: "${key}" has an empty segment`);
    if (path.some(s => s === '__proto__' || s === 'constructor' || s === 'prototype')) throw new Error(`--set ${text}: "${key}" isn't a manifest setting`);
    const raw = text.slice(eq + 1);
    let value: unknown = raw;
    try { value = JSON.parse(raw); } catch { /* a plain string */ }
    return { text, path, value };
}

const isObject = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** An array element by index, or by its `id` (origins). */
function elementOf(list: any[], segment: string): number {
    if (/^\d+$/.test(segment)) return Number(segment) < list.length ? Number(segment) : -1;
    return list.findIndex(e => isObject(e) && e.id === segment);
}

/**
 * Applies settings to a copy of a parsed manifest. Missing objects along the path are created
 * (`distribution.strict` works when the file has no "distribution"); array elements must exist.
 * Returns the copy and a diagnostic for each setting that can't be applied.
 */
export function applySettings(input: unknown, settings: Setting[]): { manifest: unknown; diagnostics: Diagnostic[] } {
    const manifest = structuredClone(input);
    const diagnostics: Diagnostic[] = [];
    for (const setting of settings) {
        const fail = (message: string) => diagnostics.push({ severity: 'error', path: '/' + setting.path.join('/'), rule: 'set', message: `--set ${setting.text}: ${message}` });
        let node: any = manifest;
        if (!isObject(node)) { fail('the manifest isn\'t an object'); continue; }
        let ok = true;
        for (let i = 0; i < setting.path.length && ok; i++) {
            const segment = setting.path[i];
            const last = i === setting.path.length - 1;
            const where = setting.path.slice(0, i).join('.') || 'the manifest';
            if (Array.isArray(node)) {
                const index = elementOf(node, segment);
                if (index === -1) { fail(`${where} has no element "${segment}" (use an index${node.some(e => isObject(e) && 'id' in e) ? ' or an id' : ''})`); ok = false; break; }
                if (last) node[index] = setting.value;
                else node = node[index];
            } else if (isObject(node)) {
                if (last) node[segment] = setting.value;
                else {
                    if (node[segment] === undefined) node[segment] = {};
                    node = node[segment];
                }
            } else {
                fail(`${where} is ${JSON.stringify(node)}, not an object`);
                ok = false;
            }
        }
    }
    return { manifest, diagnostics };
}
