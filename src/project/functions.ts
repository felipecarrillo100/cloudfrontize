import vm from 'vm';
import { CFFValidator } from '../core/CFFValidator';
import { CFF_LIMITS } from '../constants';
import { rewriteImports } from '../core/cff2/runtime2';
import { SnippetExtractor } from '../core/SnippetExtractor';
import type { EventType } from './schema';

import type { BuildResult, CodeProblem, FunctionType } from '../api/contract';
export type { BuildResult, CodeProblem, FunctionType };

/** Where `cloudfrontize` puts a new function: `functions/<cloudfront|lambda-edge>/<event>.<id>.js`. */
export function conventionalFile(type: FunctionType, event: EventType, id: string): string {
    return `functions/${type === 'cloudfront-function' ? 'cloudfront' : 'lambda-edge'}/${event}.${id}.js`;
}

const isRequest = (event: EventType) => event.endsWith('-request');

/** Starter code for a new function: a valid pass-through for its type, runtime and event. */
export function starterCode(type: FunctionType, runtime: string, event: EventType): string {
    if (type === 'cloudfront-function') {
        const target = isRequest(event) ? 'request' : 'response';
        if (runtime === 'cloudfront-js-1.0') {
            return `// CloudFront Function (runtime 1.0, ES 5.1) on ${event}
// https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/functions-event-structure.html
function handler(event) {
    var ${target} = event.${target};
    return ${target};
}
`;
        }
        return `// CloudFront Function (runtime 2.0) on ${event}
// https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/functions-event-structure.html
async function handler(event) {
    const ${target} = event.${target};
    return ${target};
}
`;
    }
    if (isRequest(event)) {
        return `'use strict';

// Lambda@Edge function on ${event}
// https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-event-structure.html
exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    return request;
};
`;
    }
    return `'use strict';

// Lambda@Edge function on ${event}
// https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-event-structure.html
exports.handler = async (event) => {
    const response = event.Records[0].cf.response;
    return response;
};
`;
}

/**
 * Checks a function's code without running it: syntax, and for CloudFront Functions the runtime's
 * rules and the 10 KB limit. Used for functions no behavior uses yet, which the emulator doesn't load.
 */
export function staticCheck(type: FunctionType, runtime: string, file: string, code: string, strict = false): BuildResult {
    const size = Buffer.byteLength(code);
    const result: BuildResult = { status: 'ok', checkedBy: 'static', size, sizeLimit: type === 'cloudfront-function' ? CFF_LIMITS.MAX_CODE_SIZE_BYTES : null, errors: [], warnings: [] };

    if (type === 'cloudfront-function') {
        const cffRuntime = runtime === 'cloudfront-js-1.0' ? 'cloudfront-js-1.0' : 'cloudfront-js-2.0';
        const { violations } = new CFFValidator().validate(file, code, cffRuntime);
        for (const v of violations) (v.level === 'error' ? result.errors : result.warnings).push({ message: v.message, line: v.lineNum });
        if (result.errors.length === 0) syntax(cffRuntime === 'cloudfront-js-2.0' ? `'use strict';${rewriteImports(code)}` : code, file, result);
        if (size > CFF_LIMITS.MAX_CODE_SIZE_BYTES) {
            const problem = { message: `Function size ${size} bytes exceeds the ${CFF_LIMITS.MAX_CODE_SIZE_BYTES}-byte (10 KB) CloudFront Functions limit`, line: null };
            (strict ? result.errors : result.warnings).push(problem);
        }
    } else {
        syntax(code, file, result);
    }
    if (result.errors.length) result.status = 'error';
    return result;
}

function syntax(code: string, file: string, result: BuildResult) {
    try {
        new vm.Script(code, { filename: file });
    } catch (err: any) {
        const { line, col } = SnippetExtractor.parseError(err, file);
        result.errors.push({ message: err.message, line, column: col });
    }
}
