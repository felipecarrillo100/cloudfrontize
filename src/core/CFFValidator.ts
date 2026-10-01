import * as acorn from 'acorn';

export interface CFFViolation {
    level: 'error' | 'warn';
    message: string;
    lineNum: number | null;
    hint?: string | null;
}

export type CFFRuntime = 'cloudfront-js-1.0' | 'cloudfront-js-2.0';

// Runtime 2.0 — "JavaScript runtime 2.0 features" / "Restricted features" (CloudFront Developer Guide)
const RUNTIME2_MODULES = ['crypto', 'querystring', 'buffer'];
const TIMERS = ['setTimeout', 'setImmediate', 'clearTimeout', 'setInterval', 'clearInterval'];
// Syntax AWS doesn't list as supported in runtime 2.0: it may fail when deployed
const RUNTIME2_UNLISTED: Record<string, string> = {
    ClassDeclaration: 'class', ClassExpression: 'class',
    ObjectPattern: 'destructuring', ArrayPattern: 'destructuring',
    SpreadElement: 'spread (...)', ChainExpression: 'optional chaining (?.)',
    ForOfStatement: 'for...of', TaggedTemplateExpression: 'tagged templates',
    AssignmentPattern: 'default parameters', YieldExpression: 'generators'
};

/** Minimal AST walk: visits every node, passing its parent chain. */
function walk(node: any, visit: (node: any, ancestors: any[]) => void, ancestors: any[] = []): void {
    if (!node || typeof node.type !== 'string') return;
    visit(node, ancestors);
    const next = [...ancestors, node];
    for (const key of Object.keys(node)) {
        if (key === 'loc' || key === 'start' || key === 'end') continue;
        const value = node[key];
        if (Array.isArray(value)) value.forEach(child => walk(child, visit, next));
        else if (value && typeof value.type === 'string') walk(value, visit, next);
    }
}

export class CFFValidator {
    private options: { strict?: boolean };
    private syntaxTraps = [
        { regex: /\bconst\b/, label: 'const' },
        { regex: /\blet\b/, label: 'let' },
        { regex: /=>/, label: 'Arrow Function (=>)' },
        { regex: /`/, label: 'Template Literal' },
        { regex: /\bclass\b/, label: 'class' },
        { regex: /\beval\s*\(/, label: 'eval()' },
        { regex: /\bnew\s+Function\s*\(/, label: 'new Function()' }
    ];

    private policyTraps = [
        {
            regex: /\.includes\s*\(/,
            label: '.includes()',
            hint: "unsupported by CloudFront Strings/Arrays. Use '.indexOf(x) !== -1' instead."
        },
        {
            regex: /\.startsWith\s*\(/,
            label: '.startsWith()',
            hint: "unsupported by CloudFront Strings. Use '.indexOf(x) === 0' instead."
        },
        {
            regex: /\.endsWith\s*\(/,
            label: '.endsWith()',
            hint: "unsupported by CloudFront Strings. Use '.slice(-len) === x' instead."
        },
        {
            regex: /\.find(Index)?\s*\(/,
            label: 'Array.find/findIndex()',
            hint: "unsupported in ES5. Use a 'for' loop or '.filter()[0]' instead."
        },
        {
            regex: /\.fill\s*\(/,
            label: 'Array.fill()',
            hint: "unsupported in ES5. Use a 'for' loop instead."
        },
        {
            regex: /\bObject\.(assign|values|entries|fromEntries)\s*\(/,
            label: 'Modern Object Helpers',
            hint: "unsupported in ES5. Use a 'for...in' loop or manual assignment."
        },
        {
            regex: /\bnew\s+(Map|Set|Promise)\b/,
            label: 'Global Objects (Map/Set/Promise)',
            hint: "unsupported in CFF. Use standard Objects {} or Arrays [] instead."
        }
    ];

    constructor(options: { strict?: boolean } = {}) {
        this.options = options;
    }

    public validate(filename: string, code: string, runtime: CFFRuntime = 'cloudfront-js-1.0'): { valid: boolean; violations: CFFViolation[] } {
        if (runtime === 'cloudfront-js-2.0') return this._validateRuntime2(code);
        const violations: CFFViolation[] = [];

        // --- Layer 1: Structural Parsing (Syntax) ---
        try {
            acorn.parse(code, { ecmaVersion: 5, sourceType: 'script' });
        } catch (err: any) {
            const locationMatch = err.message.match(/(\d+):\d+\)$/);
            const lineNum = locationMatch ? parseInt(locationMatch[1], 10) : null;
            let message = err.message.replace('Unexpected token', 'Syntax Error');

            let hint: string | null = null;
            for (const trap of this.syntaxTraps) {
                if (trap.regex.test(code)) {
                    message = `CloudFront Function requires ES 5.1 — '${trap.label}' is not allowed`;
                    hint = this._getHint(trap.label);
                    break;
                }
            }
            violations.push({ level: 'error', message, lineNum, hint });
            return { valid: false, violations };
        }

        // --- Layer 2: Policy Scan (Preserving Line Numbers) ---
        const cleanCode = code
            .replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, (match) => ' '.repeat(match.length))
            .replace(/'(?:\\'|.)*?'|"(?:\\"|.)*?"/g, (match) => ' '.repeat(match.length))
            .replace(/\/(?![*+?])(?:[^\r\n\[/\\]|\\.|\[(?:[^\r\n\]\\]|\\.)*\])+\//g, (match) => ' '.repeat(match.length));

        let isStrictlyValid = true;

        for (const trap of this.syntaxTraps) {
            if (trap.regex.test(cleanCode)) {
                violations.push({
                    level: 'error',
                    message: `CloudFront Function requires ES 5.1 — '${trap.label}' is not allowed`,
                    lineNum: null,
                    hint: this._getHint(trap.label)
                });
                isStrictlyValid = false;
            }
        }

        for (const trap of this.policyTraps) {
            // Use global match to find all occurrences
            let match;
            const globalRegex = new RegExp(trap.regex.source, 'g');
            while ((match = globalRegex.exec(cleanCode)) !== null) {
                const lineNum = code.substring(0, match.index).split('\n').length;
                violations.push({
                    level: 'error', // Promote to Error
                    message: `${trap.label} is ES6+ and ${trap.hint}`,
                    lineNum,
                    hint: trap.hint
                });
                isStrictlyValid = false; // Block the build
            }
        }

        return { valid: isStrictlyValid, violations };
    }

    /**
     * Runtime 2.0: ES 5.1 plus selected ES 6–12 features. Documented restrictions are errors; syntax
     * AWS doesn't list as supported is a warning (it may not work when deployed).
     */
    private _validateRuntime2(code: string): { valid: boolean; violations: CFFViolation[] } {
        const violations: CFFViolation[] = [];
        let ast: any;
        try {
            ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
        } catch (err: any) {
            const locationMatch = err.message.match(/(\d+):\d+\)$/);
            violations.push({ level: 'error', message: err.message.replace('Unexpected token', 'Syntax Error'), lineNum: locationMatch ? parseInt(locationMatch[1], 10) : null });
            return { valid: false, violations };
        }

        const error = (node: any, message: string, hint?: string) => violations.push({ level: 'error', message, lineNum: node.loc?.start.line ?? null, hint: hint ?? null });
        const warn = (node: any, message: string, hint?: string) => violations.push({ level: 'warn', message, lineNum: node.loc?.start.line ?? null, hint: hint ?? null });
        const warnedSyntax = new Set<string>();

        // The function must define a top-level `handler`
        const hasHandler = ast.body.some((n: any) =>
            (n.type === 'FunctionDeclaration' && n.id?.name === 'handler') ||
            (n.type === 'VariableDeclaration' && n.declarations.some((d: any) => d.id?.name === 'handler')));
        if (!hasHandler) violations.push({ level: 'error', message: 'Define a top-level function named handler', lineNum: null, hint: 'async function handler(event) { return event.request; }' });

        walk(ast, (node, ancestors) => {
            switch (node.type) {
                case 'ImportDeclaration':
                    if (node.source.value !== 'cloudfront') {
                        error(node, `Only the 'cloudfront' module can be imported, not '${node.source.value}'`, "import cf from 'cloudfront';");
                    } else if (node.specifiers.length !== 1 || node.specifiers[0].type !== 'ImportDefaultSpecifier') {
                        error(node, "Import the cloudfront module as a default import", "import cf from 'cloudfront';");
                    }
                    break;
                case 'ImportExpression':
                    error(node, 'Dynamic import() is not supported');
                    break;
                case 'ExportNamedDeclaration':
                case 'ExportDefaultDeclaration':
                case 'ExportAllDeclaration':
                    error(node, 'CloudFront Functions don\'t export anything; define a top-level handler function instead');
                    break;
                case 'CallExpression': {
                    const callee = node.callee;
                    if (callee.type === 'Identifier' && callee.name === 'eval') error(node, 'eval() is not supported (dynamic code evaluation)');
                    if (callee.type === 'Identifier' && callee.name === 'Function') error(node, 'Function constructors are not supported (dynamic code evaluation)');
                    if (callee.type === 'Identifier' && TIMERS.includes(callee.name)) error(node, `${callee.name}() is not supported: functions must run to completion without timers`);
                    if (callee.type === 'Identifier' && callee.name === 'require') {
                        const arg = node.arguments[0];
                        if (!arg || arg.type !== 'Literal' || !RUNTIME2_MODULES.includes(arg.value)) {
                            error(node, `require() only supports 'crypto', 'querystring' and 'buffer'`);
                        }
                    }
                    if (callee.type === 'MemberExpression' && callee.object?.name === 'console') {
                        if (callee.property?.name !== 'log') warn(node, `console.${callee.property?.name}() isn't available; CloudFront Functions only support console.log()`);
                        else if (node.arguments.length > 1) warn(node, "console.log() doesn't support comma syntax; concatenate instead", "console.log('a' + ' ' + 'b')");
                    }
                    break;
                }
                case 'NewExpression':
                    if (node.callee.type === 'Identifier' && node.callee.name === 'Function') error(node, 'Function constructors are not supported (dynamic code evaluation)');
                    break;
                case 'FunctionExpression':
                case 'ArrowFunctionExpression':
                    if (node.async) warn(node, '"async arguments and closures are not supported" in runtime 2.0; keep async functions at the top level');
                    if (node.generator) warn(node, "Generators aren't listed as supported in runtime 2.0");
                    break;
                case 'FunctionDeclaration': {
                    const nested = ancestors.some(a => a.type.includes('Function'));
                    if (node.async && nested) warn(node, '"async arguments and closures are not supported" in runtime 2.0; keep async functions at the top level');
                    if (node.generator) warn(node, "Generators aren't listed as supported in runtime 2.0");
                    break;
                }
                case 'LogicalExpression':
                    if (node.operator === '??' && !warnedSyntax.has('??')) {
                        warnedSyntax.add('??');
                        warn(node, "Nullish coalescing (??) isn't listed as supported in runtime 2.0");
                    }
                    break;
                default: {
                    const label = RUNTIME2_UNLISTED[node.type];
                    // Rest parameters are supported; destructuring/spread elsewhere isn't listed
                    const isRestParam = node.type === 'RestElement';
                    if (label && !isRestParam && !warnedSyntax.has(label)) {
                        warnedSyntax.add(label);
                        warn(node, `${label} isn't listed as supported in CloudFront Functions runtime 2.0`);
                    }
                }
            }
        });

        return { valid: !violations.some(v => v.level === 'error'), violations };
    }

    private _getHint(label: string): string | null {
        const hints: Record<string, string> = {
            'const': "Use 'var' instead.",
            'let': "Use 'var' instead.",
            'Arrow Function (=>)': "Use a regular function expression: function(x) { return x; }",
            'Template Literal': "Use string concatenation: 'Hello ' + name",
            'class': "Use constructor functions and prototype inheritance.",
            'eval()': "eval() is forbidden in CloudFront Function.",
            'new Function()': "new Function() is forbidden in CloudFront Function."
        };
        return hints[label] || null;
    }
}
