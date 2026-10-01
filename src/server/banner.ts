import path from 'path';
import { CloudFrontizeOptions } from '../core/types';
import type { Project } from '../project/loadProject';
import { VERSION } from '../version';

export function printTopBanner(options: CloudFrontizeOptions, project?: Project) {
    console.log(`\n☁️  \x1b[1mCloudfrontize v${VERSION}\x1b[0m\n`);
    if (project) console.log(`  ➜ Project: \x1b[1m${project.manifest.name}\x1b[0m \x1b[90m(${project.dir})\x1b[0m`);
    console.log(`  ➜ Local:   \x1b[36mhttp://localhost:${options.port}/\x1b[0m`);
    if (options.webui !== undefined && options.webui !== false) {
        console.log(`  ➜ WebUI:   \x1b[36mhttp://localhost:${options.webui}/\x1b[0m`);
    }
    if (!project) console.log(`  ➜ Mode:    ${options.mode || 'rest'}`);
    const activeFlags = [
        options.debug && '--debug',
        options.strict && '--strict',
        options.single && '--single',
        options.cors && '--cors',
    ].filter(Boolean);
    if (activeFlags.length) {
        console.log(`  ➜ Flags:   \x1b[33m${activeFlags.join(' ')}\x1b[0m`);
    }
    console.log('');
}

export function printBottomBanner(options: CloudFrontizeOptions) {
    const { edgeRunner, cffRunner } = options;
    const hasActiveEdge = edgeRunner && edgeRunner.hasLoadedModules();
    const hasActiveCff = cffRunner && cffRunner.hasLoadedModules();

    if (!hasActiveEdge && !hasActiveCff) return;

    const describe = (runner: any) => {
        const files = runner.options?.files as { path: string }[] | undefined;
        if (files?.length) return files.map(f => path.basename(f.path)).join(', ');
        const p = runner.getRunnerPath();
        return p ? path.basename(p) : 'Active';
    };

    console.log(`  ⚙️  Active Environment`);
    if (hasActiveEdge) console.log(`     - \x1b[35mLambda@Edge\x1b[0m: ${describe(edgeRunner)}`);
    if (hasActiveCff) console.log(`     - \x1b[35mCloudFront Function\x1b[0m: ${describe(cffRunner)}`);
    console.log('');
}
