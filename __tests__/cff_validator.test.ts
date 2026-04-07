export {};
'use strict';

const { CFFValidator } = require('../src/core/CFFValidator');

describe('CFFValidator: The "No-Mercy" Fidelity Suite', () => {
    let validator;
    let consoleSpy;
    let warnSpy;

    beforeEach(() => {
        validator = new CFFValidator({ strict: true });
        consoleSpy = jest.spyOn(console, 'error').mockImplementation();
        warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    // --- GROUP 1: LEXICAL AMBIGUITY ---

    test('✅ Should pass keywords used as labels', () => {
        const code = "myLabel: var x = 1; loop: for(var i=0; i<1; i++) { break loop; }";
        const { valid } = validator.validate('labels.js', code);
        expect(valid).toBe(true);
    });

    test('✅ Should pass regex literals containing forbidden keywords', () => {
        const code = "var isConst = /const\\s+x/.test('const x');";
        const { valid } = validator.validate('regex.js', code);
        expect(valid).toBe(true);
    });

    test('✅ Should pass complex nested quotes and escapes', () => {
        const code = "var s = \"It's a \\\"const\\\" variable\"; var s2 = 'He said \"let it be\"';";
        const { valid } = validator.validate('escapes.js', code);
        expect(valid).toBe(true);
    });

    // --- GROUP 2: ES6+ STRUCTURAL TRAPS (Acorn Layer) ---

    test('❌ Should fail on Object Property Shorthand', () => {
        const code = "var a = 1; var obj = { a };";
        const { valid, violations } = validator.validate('shorthand.js', code);
        expect(valid).toBe(false);
        expect(violations[0].level).toBe('error');
        expect(violations[0].message).toMatch(/Syntax Error/);
    });

    test('❌ Should fail on For-Of loops', () => {
        const code = "var arr = [1, 2]; for (var x of arr) {}";
        const { valid, violations } = validator.validate('forof.js', code);
        expect(valid).toBe(false);
        expect(violations[0].message).toMatch(/Syntax Error/);
    });

    test('❌ Should fail on Template Literals', () => {
        const code = "var x = `Outer ${ `Inner` }`;";
        const { valid, violations } = validator.validate('nested_template.js', code);
        expect(valid).toBe(false);
        expect(violations[0].message).toMatch(/Template Literal/);
    });

    // --- GROUP 3: KEYWORD TRAPS (Syntax Traps) ---

    test('❌ Should fail on "const"', () => {
        const code = "const x = 1;";
        const { valid, violations } = validator.validate('const.js', code);
        expect(valid).toBe(false);
        expect(violations[0].message).toMatch(/const/);
        expect(violations[0].hint).toMatch(/var/);
    });

    test('❌ Should fail on "let"', () => {
        const code = "let x = 1;";
        const { valid, violations } = validator.validate('let.js', code);
        expect(valid).toBe(false);
        expect(violations[0].message).toMatch(/let/);
        expect(violations[0].hint).toMatch(/var/);
    });

    test('❌ Should fail on Arrow Functions', () => {
        const code = "var f = function() { return x => x; }";
        const { valid, violations } = validator.validate('arrow.js', code);
        expect(valid).toBe(false);
        expect(violations[0].message).toMatch(/Arrow Function/);
        expect(violations[0].hint).toMatch(/function expression/);
    });

    // --- GROUP 4: POLICY TRAPS (Ambiguous Methods) ---

    test('❌ Should warn on .includes() usage', () => {
        const code = "if (accept.includes('br')) {}";
        const { valid, violations } = validator.validate('policy.js', code);
        expect(valid).toBe(true); // warnings don't fail the build
        const warn = violations.find(v => v.level === 'warn' && v.message.includes('.includes()'));
        expect(warn).toBeDefined();
        expect(warn.lineNum).toBe(1);
    });

    test('❌ Should warn on Object.assign()', () => {
        const code = "Object.assign({}, {a:1});";
        const { valid, violations } = validator.validate('assign.js', code);
        expect(valid).toBe(true);
        const warn = violations.find(v => v.message.includes('Object.assign()'));
        expect(warn).toBeDefined();
    });

    // --- GROUP 5: DYNAMIC EXECUTION ---

    test('❌ Should fail on eval() usage', () => {
        const code = "eval('var x = 1');";
        const { valid, violations } = validator.validate('eval.js', code);
        expect(valid).toBe(false);
        expect(violations[0].message).toMatch(/eval\(\)/);
    });

    test('❌ Should fail on new Function()', () => {
        const code = "var f = new Function('return 1');";
        const { valid, violations } = validator.validate('func.js', code);
        expect(valid).toBe(false);
        expect(violations[0].message).toMatch(/new Function\(\)/);
    });

    // --- GROUP 6: LEGACY COMPLIANCE ---

    test('✅ Should pass complex ES5 prototype inheritance', () => {
        const code = `
            function Parent() {}
            Parent.prototype.greet = function() { return "hi"; };
            function Child() { Parent.call(this); }
            Child.prototype = Object.create(Parent.prototype);
            Child.prototype.constructor = Child;
        `;
        const { valid } = validator.validate('inheritance.js', code);
        expect(valid).toBe(true);
    });

    test('❌ Should fail on Async/Await', () => {
        const code = "async function run() { await Promise.resolve(); }";
        const { valid, violations } = validator.validate('async.js', code);
        expect(valid).toBe(false);
        expect(violations[0].message).toMatch(/Syntax Error/);
    });

    // --- GROUP 7: STRUCTURED OUTPUT ---

    test('📋 Should return lineNum in violation when acorn provides location', () => {
        const code = "var a = 1; var obj = { a };"; // Shorthand property – acorn fails with location
        const { violations } = validator.validate('shorthand.js', code);
        // lineNum may or may not be present depending on the error output, but should be a number if present
        if (violations[0].lineNum !== null) {
            expect(typeof violations[0].lineNum).toBe('number');
        }
    });

    test('📋 Should include a fix hint for const violations', () => {
        const code = "const x = 1;";
        const { violations } = validator.validate('const.js', code);
        expect(violations[0].hint).toBeTruthy();
    });
});
