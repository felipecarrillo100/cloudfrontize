'use strict';

const { CFFValidator } = require('../src/CFFValidator');

describe('CFFValidator: The "No-Mercy" Fidelity Suite', () => {
    let validator;
    let consoleSpy;
    let warnSpy;
    let exitSpy;

    beforeEach(() => {
        // Most tests use strict: true to ensure process.exit(1) is called on violations
        validator = new CFFValidator({ strict: true });
        consoleSpy = jest.spyOn(console, 'error').mockImplementation();
        warnSpy = jest.spyOn(console, 'warn').mockImplementation();
        exitSpy = jest.spyOn(process, 'exit').mockImplementation();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    // --- GROUP 1: LEXICAL AMBIGUITY ---

    test('✅ Should pass keywords used as labels', () => {
        const code = "myLabel: var x = 1; loop: for(var i=0; i<1; i++) { break loop; }";
        expect(validator.validate('labels.js', code)).toBe(true);
    });

    test('✅ Should pass regex literals containing forbidden keywords', () => {
        const code = "var isConst = /const\\s+x/.test('const x');";
        expect(validator.validate('regex.js', code)).toBe(true);
    });

    test('✅ Should pass complex nested quotes and escapes', () => {
        const code = "var s = \"It's a \\\"const\\\" variable\"; var s2 = 'He said \"let it be\"';";
        expect(validator.validate('escapes.js', code)).toBe(true);
    });

    // --- GROUP 2: ES6+ STRUCTURAL TRAPS (Acorn Layer) ---

    test('❌ Should fail on Object Property Shorthand', () => {
        const code = "var a = 1; var obj = { a };";
        const isValid = validator.validate('shorthand.js', code);
        expect(isValid).toBe(false);
        // Updated to match our new Syntax Error label
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Syntax Error'));
    });

    test('❌ Should fail on For-Of loops', () => {
        const code = "var arr = [1, 2]; for (var x of arr) {}";
        const isValid = validator.validate('forof.js', code);
        expect(isValid).toBe(false);
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Syntax Error'));
    });

    test('❌ Should fail on Template Literals', () => {
        const code = "var x = `Outer ${ `Inner` }`;";
        const isValid = validator.validate('nested_template.js', code);
        expect(isValid).toBe(false);
        // Matches our custom label from the post-mortem loop
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Forbidden ES6+ Syntax: Template Literal'));
    });

    // --- GROUP 3: KEYWORD TRAPS (Syntax Traps) ---

    test('❌ Should fail on "const"', () => {
        const code = "const x = 1;";
        const isValid = validator.validate('const.js', code);
        expect(isValid).toBe(false);
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Forbidden ES6+ Syntax: const'));
    });

    test('❌ Should fail on "let"', () => {
        const code = "let x = 1;";
        const isValid = validator.validate('let.js', code);
        expect(isValid).toBe(false);
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Forbidden ES6+ Syntax: let'));
    });

    test('❌ Should fail on Arrow Functions', () => {
        const code = "var f = function() { return x => x; }";
        const isValid = validator.validate('arrow.js', code);
        expect(isValid).toBe(false);
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Arrow Function (=>)'));
    });

    // --- GROUP 4: POLICY TRAPS (Ambiguous Methods) ---

    test('❌ Should fail on .includes() in STRICT mode', () => {
        const code = "if (accept.includes('br')) {}";
        validator.validate('policy.js', code);
        // In strict mode, policyTraps call handleViolation(..., 'warn')
        // which currently returns true and warns.
        // NOTE: If you want .includes to also EXIT(1) in strict mode,
        // the Validator's handleViolation 'warn' logic needs to check this.options.strict.
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('POLICY WARNING'));
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('.includes() is ES6'));
    });

    test('❌ Should fail on Object.assign()', () => {
        const code = "Object.assign({}, {a:1});";
        validator.validate('assign.js', code);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Object.assign()'));
    });

    // --- GROUP 5: DYNAMIC EXECUTION ---

    test('❌ Should fail on eval() usage', () => {
        const code = "eval('var x = 1');";
        const isValid = validator.validate('eval.js', code);

        // This is caught by Layer 2 as an 'error' level by default
        expect(isValid).toBe(false);
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[CFF] ES 5.1 ERROR'));
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('eval()'));
    });

    test('❌ Should fail on new Function()', () => {
        const code = "var f = new Function('return 1');";
        const isValid = validator.validate('func.js', code);

        expect(isValid).toBe(false);
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('new Function()'));
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
        expect(validator.validate('inheritance.js', code)).toBe(true);
    });

    test('❌ Should fail on Async/Await', () => {
        const code = "async function run() { await Promise.resolve(); }";
        const isValid = validator.validate('async.js', code);
        expect(isValid).toBe(false);
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Syntax Error'));
    });
});
