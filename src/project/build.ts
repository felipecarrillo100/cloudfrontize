import * as acorn from 'acorn';
import dotenv from 'dotenv';
import fs from 'fs';
import { builtinModules } from 'module';
import path from 'path';
import { CodeProcessor, TransformationLevel } from '../core/CodeProcessor';
import { KeyValueStore } from '../core/KeyValueStore';
import { CFF_LIMITS } from '../constants';
import type { CodeProblem, EdgeEvent } from '../api/contract';
import { staticCheck } from './functions';
import { loadProject, Project } from './loadProject';
import { EVENT_TYPES } from './schema';

export interface BuiltFunction {
    id: string;
    type: 'cloudfront-function' | 'lambda-edge';
    runtime: string;
    /** Relative to the output folder. */
    output: string;
    size: number;
    /** Where it's attached: behavior ("default" or a path pattern) and event. */
    associations: { behavior: string; event: EdgeEvent }[];
    keyValueStore?: string;
    /** Modules the code requires that Lambda doesn't provide: they must be bundled. */
    dependencies?: string[];
    errors: CodeProblem[];
    warnings: CodeProblem[];
}

export interface BuildReport {
    project: string;
    outDir: string;
    level: TransformationLevel;
    functions: BuiltFunction[];
    keyValueStores: { id: string; output: string; keyCount: number }[];
    ok: boolean;
}

/** The output folder's description of what was built, for deploy scripts. */
export const BUILD_MANIFEST = 'build.json';

const BUILTINS = new Set(builtinModules.flatMap(m => [m, `node:${m}`]));

/** Modules required by Lambda@Edge code that aren't Node built-ins or the AWS SDK v3 (which Lambda includes). */
export function externalRequires(code: string): string[] {
    const found = new Set<string>();
    let ast: any;
    try {
        ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true, allowHashBang: true });
    } catch {
        return [];
    }
    const visit = (node: any) => {
        if (!node || typeof node.type !== 'string') return;
        if (node.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === 'require'
            && node.arguments[0]?.type === 'Literal' && typeof node.arguments[0].value === 'string') {
            const id: string = node.arguments[0].value;
            const root = id.startsWith('@') ? id.split('/').slice(0, 2).join('/') : id.split('/')[0];
            if (!BUILTINS.has(id) && !BUILTINS.has(root) && !root.startsWith('@aws-sdk/')) found.add(id);
        }
        for (const value of Object.values(node)) {
            if (Array.isArray(value)) value.forEach(visit);
            else if (value && typeof value === 'object') visit(value);
        }
    };
    visit(ast);
    return [...found].sort();
}

function associationsOf(project: Project, id: string) {
    const out: { behavior: string; event: EdgeEvent }[] = [];
    const all = [{ key: 'default', functions: project.manifest.defaultBehavior.functions }, ...project.manifest.behaviors.map(b => ({ key: b.pathPattern, functions: b.functions }))];
    for (const b of all) for (const event of EVENT_TYPES) if (b.functions[event] === id) out.push({ behavior: b.key, event });
    return out;
}

const lineOf = (code: string, needle: string) => code.slice(0, code.indexOf(needle)).split('\n').length;

/**
 * Builds a project's functions for deployment: placeholders baked from the bake file, CloudFrontize
 * metadata removed, optionally minified. The output is checked as AWS will see it (CloudFront
 * Functions: runtime rules and the 10 KB limit on the built code).
 *
 *   <out>/cloudfront/<id>.js            CloudFront Functions (aws cloudfront create-function --function-code)
 *   <out>/lambda-edge/<id>/index.js     Lambda@Edge (zip the folder; handler "index.handler")
 *   <out>/kvs/<id>.json                 key value stores, in the AWS import format
 *   <out>/build.json                    what was built and where each function is attached
 */
export async function buildProject(target: string, options: { outDir?: string; level?: TransformationLevel } = {}): Promise<BuildReport> {
    const { project } = loadProject(target);
    const level = options.level ?? 'baked';
    const outDir = path.resolve(options.outDir ?? path.join(project.dir, 'dist'));
    if (outDir === project.dir || project.dir.startsWith(outDir + path.sep)) throw new Error(`The output folder can't be the project folder or contain it: ${outDir}`);
    const bakeVars = project.bakeFile && fs.existsSync(project.bakeFile) ? dotenv.parse(fs.readFileSync(project.bakeFile)) : {};

    fs.rmSync(outDir, { recursive: true, force: true });
    fs.mkdirSync(outDir, { recursive: true });

    const functions: BuiltFunction[] = [];
    for (const fn of Object.values(project.functions)) {
        const source = fs.readFileSync(fn.absoluteFile, 'utf8');
        const code = await CodeProcessor.process(source, fn.type === 'cloudfront-function' ? 'cff' : 'edge', level, bakeVars);
        const isCff = fn.type === 'cloudfront-function';
        const output = isCff ? path.join('cloudfront', `${fn.id}.js`) : path.join('lambda-edge', fn.id, 'index.js');
        fs.mkdirSync(path.dirname(path.join(outDir, output)), { recursive: true });
        fs.writeFileSync(path.join(outDir, output), code.endsWith('\n') ? code : code + '\n');

        // Checked as built (strict: AWS rejects a CloudFront Function over 10 KB)
        const check = staticCheck(fn.type, fn.runtime, output, code, true);
        const warnings = [...check.warnings];
        for (const name of new Set([...code.matchAll(/__([A-Z][A-Z0-9_]*)__/g)].map(m => m[1]))) {
            warnings.push({ message: `__${name}__ isn't defined in the bake file, so it's deployed as written`, line: lineOf(code, `__${name}__`) });
        }
        const dependencies = isCff ? undefined : externalRequires(code);
        if (dependencies?.length) {
            warnings.push({ message: `Requires ${dependencies.join(', ')}: bundle ${dependencies.length === 1 ? 'it' : 'them'} with the function (Lambda@Edge only has Node.js built-ins and the AWS SDK v3)`, line: null });
        }
        functions.push({
            id: fn.id, type: fn.type, runtime: fn.runtime, output: output.split(path.sep).join('/'), size: Buffer.byteLength(code),
            associations: associationsOf(project, fn.id),
            ...(isCff && fn.keyValueStore ? { keyValueStore: fn.keyValueStore } : {}),
            ...(dependencies ? { dependencies } : {}),
            errors: check.errors, warnings,
        });
    }

    const keyValueStores: BuildReport['keyValueStores'] = [];
    for (const [id, store] of Object.entries(project.manifest.keyValueStores)) {
        const content = fs.readFileSync(path.resolve(project.dir, store.file), 'utf8');
        const { entries } = KeyValueStore.checkContent(content, true);
        const output = path.join('kvs', `${id}.json`);
        fs.mkdirSync(path.join(outDir, 'kvs'), { recursive: true });
        fs.writeFileSync(path.join(outDir, output), content);
        keyValueStores.push({ id, output: output.split(path.sep).join('/'), keyCount: entries.size });
    }

    const report: BuildReport = { project: project.manifest.name, outDir, level, functions, keyValueStores, ok: functions.every(f => f.errors.length === 0) };
    fs.writeFileSync(path.join(outDir, BUILD_MANIFEST), JSON.stringify({
        project: report.project, level, builtAt: new Date().toISOString(), cffSizeLimit: CFF_LIMITS.MAX_CODE_SIZE_BYTES,
        functions: functions.map(({ errors, warnings, ...f }) => f), keyValueStores,
    }, null, 2) + '\n');
    return report;
}
