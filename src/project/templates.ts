import fs from 'fs';
import path from 'path';

import type { TemplateInfo } from '../api/contract';

/** A starter project ("cloudfrontize init --template <id>", or the WebUI's New project dialog). */
export type { TemplateInfo };

/** The built-in template: one local origin with a starter page, no functions. */
export const EMPTY_TEMPLATE: TemplateInfo = {
    id: 'empty',
    name: 'Empty',
    description: 'One origin and a starter page, no functions: add behaviors and functions from the workbench.',
    order: 0
};

/** Files of a template folder that are about the template, not part of the project. */
export const TEMPLATE_META = 'template.json';

/** Where the templates are: `templates/` at the package root (from src/ and from dist/). */
export function templatesDir(): string {
    const candidates = [path.resolve(__dirname, '..', '..', 'templates'), path.resolve(__dirname, '..', 'templates')];
    return candidates.find(c => fs.existsSync(c)) ?? candidates[0];
}

/** Every template, Empty first, then by their order. */
export function listTemplates(): TemplateInfo[] {
    const dir = templatesDir();
    const found: TemplateInfo[] = [];
    if (fs.existsSync(dir)) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const meta = path.join(dir, entry.name, TEMPLATE_META);
            if (!entry.isDirectory() || !fs.existsSync(meta)) continue;
            const data = JSON.parse(fs.readFileSync(meta, 'utf8'));
            found.push({ id: entry.name, name: data.name, description: data.description, order: data.order ?? 100, ...(data.requires ? { requires: data.requires } : {}) });
        }
    }
    return [EMPTY_TEMPLATE, ...found.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))];
}

/** A template's folder, or null for the built-in Empty template. @throws for an unknown id. */
export function templateFolder(id: string): string | null {
    if (id === EMPTY_TEMPLATE.id) return null;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error(`Unknown template "${id}"`);
    const folder = path.join(templatesDir(), id);
    if (!fs.existsSync(path.join(folder, TEMPLATE_META))) {
        throw new Error(`Unknown template "${id}". Available: ${listTemplates().map(t => t.id).join(', ')}`);
    }
    return folder;
}
