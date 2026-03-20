'use strict';

const acorn = require('acorn');

class CFFValidator {
    constructor(options = {}) {
        this.options = options;

        this.syntaxTraps = [
            { regex: /\bconst\b/, label: 'const' },
            { regex: /\blet\b/, label: 'let' },
            { regex: /=>/, label: 'Arrow Function (=>)' },
            { regex: /`/, label: 'Template Literal' },
            { regex: /\bclass\b/, label: 'class' },
            { regex: /\beval\s*\(/, label: 'eval()' },
            { regex: /\bnew\s+Function\s*\(/, label: 'new Function()' }
        ];

        this.policyTraps = [
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
                regex: /\bObject\.assign\s*\(/,
                label: 'Object.assign()',
                hint: "unsupported. Use a 'for...in' loop or manual assignment."
            }
        ];
    }

    validate(filename, code) {
        const violations = [];

        // --- Layer 1: Structural Parsing (Syntax) ---
        try {
            acorn.parse(code, { ecmaVersion: 5, sourceType: 'script' });
        } catch (err) {
            const locationMatch = err.message.match(/(\d+):\d+\)$/);
            const lineNum = locationMatch ? parseInt(locationMatch[1], 10) : null;
            let message = err.message.replace('Unexpected token', 'Syntax Error');

            let hint = null;
            for (let trap of this.syntaxTraps) {
                if (trap.regex.test(code)) {
                    message = `CloudFront Functions requires ES 5.1 — '${trap.label}' is not allowed`;
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

        // Check for "Valid ES5 but Forbidden in CFF"
        for (let trap of this.syntaxTraps) {
            if (trap.regex.test(cleanCode)) {
                violations.push({
                    level: 'error',
                    message: `CloudFront Functions requires ES 5.1 — '${trap.label}' is not allowed`,
                    lineNum: null,
                    hint: this._getHint(trap.label)
                });
                isStrictlyValid = false;
            }
        }

        // Check for Policy Warnings
        for (let trap of this.policyTraps) {
            const match = trap.regex.exec(cleanCode);
            if (match) {
                const lineNum = code.substring(0, match.index).split('\n').length;
                violations.push({
                    level: 'warn',
                    message: `${trap.label} is ES6 and ${trap.hint}`,
                    lineNum
                });
            }
        }

        return { valid: isStrictlyValid, violations };
    }

    _getHint(label) {
        const hints = {
            'const': "Use 'var' instead.",
            'let': "Use 'var' instead.",
            'Arrow Function (=>)': "Use a regular function expression: function(x) { return x; }",
            'Template Literal': "Use string concatenation: 'Hello ' + name",
            'class': "Use constructor functions and prototype inheritance.",
            'eval()': "eval() is forbidden in CloudFront Functions.",
            'new Function()': "new Function() is forbidden in CloudFront Functions."
        };
        return hints[label] || null;
    }

    // Legacy method kept for backwards compatibility with tests that check console output
    handleViolation(filename, message, level = 'error') {
        const cleanMessage = message.replace('Unexpected token', 'Syntax Error');

        if (level === 'error') {
            const errorMsg = `🛑 [CFF] ES 5.1 ERROR in ${filename}: ${cleanMessage}`;
            console.error(errorMsg);
            return false;
        } else {
            console.warn(`⚠️  [CFF] POLICY WARNING in ${filename}: ${cleanMessage}`);
            return true;
        }
    }
}

module.exports = { CFFValidator };
