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
        let isStrictlyValid = true;

        // --- Layer 1: Structural Parsing (Syntax) ---
        try {
            acorn.parse(code, { ecmaVersion: 5, sourceType: 'script' });
        } catch (err) {
            const locationMatch = err.message.match(/\(\d+:\d+\)$/);
            const location = locationMatch ? locationMatch[0] : '';
            let message = err.message;

            for (let trap of this.syntaxTraps) {
                if (trap.regex.test(code)) {
                    message = `Forbidden ES6+ Syntax: ${trap.label} ${location}`;
                    break;
                }
            }
            return this.handleViolation(filename, message, 'error');
        }

        // --- Layer 2: Policy Scan (Preserving Line Numbers) ---
        // Instead of deleting, we overwrite comments/strings with spaces of the same length
        // to keep the line/column counts perfectly aligned with the original file.
        const cleanCode = code
            .replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, (match) => ' '.repeat(match.length))
            .replace(/'(?:\\'|.)*?'|"(?:\\"|.)*?"/g, (match) => ' '.repeat(match.length))
            .replace(/\/(?![*+?])(?:[^\r\n\[/\\]|\\.|\[(?:[^\r\n\]\\]|\\.)*\])+\//g, (match) => ' '.repeat(match.length));

        // Check for "Valid ES5 but Forbidden in CFF"
        for (let trap of this.syntaxTraps) {
            if (trap.regex.test(cleanCode)) {
                const violationResult = this.handleViolation(filename, `Forbidden pattern: ${trap.label}`, 'error');
                if (!violationResult) isStrictlyValid = false;
            }
        }

        // Check for Policy Warnings
        for (let trap of this.policyTraps) {
            // Reset regex index for global flags if any, though here we just need the first match
            const match = trap.regex.exec(cleanCode);
            if (match) {
                // Now match.index is IDENTICAL to the position in the original code!
                const lineNum = code.substring(0, match.index).split('\n').length;
                const message = `${trap.label} is ES6 and ${trap.hint} (Line ${lineNum})`;
                this.handleViolation(filename, message, 'warn');
            }
        }

        return isStrictlyValid;
    }

    handleViolation(filename, message, level = 'error') {
        const cleanMessage = message.replace('Unexpected token', 'Syntax Error');

        if (level === 'error') {
            const errorMsg = `🛑 [CFF] ES 5.1 ERROR in ${filename}: ${cleanMessage}`;
            if (this.options.strict) {
                console.error(errorMsg);
                process.exit(1);
            }
            console.error(errorMsg);
            return false;
        } else {
            console.warn(`⚠️  [CFF] POLICY WARNING in ${filename}: ${cleanMessage}`);
            return true;
        }
    }
}

module.exports = { CFFValidator };
