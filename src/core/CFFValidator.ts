import * as acorn from 'acorn';

export interface CFFViolation {
    level: 'error' | 'warn';
    message: string;
    lineNum: number | null;
    hint?: string | null;
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

    public validate(filename: string, code: string): { valid: boolean; violations: CFFViolation[] } {
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
