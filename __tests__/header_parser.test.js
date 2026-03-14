'use strict';

const fs = require('fs');
const path = require('path');
const { HeaderParser } = require('../src/headerParser');

describe('HeaderParser: The "Gatekeeper" Fidelity Suite', () => {
    let parser;
    let console_spy;
    let exit_spy;
    // Keeping the temp file name consistent with your lowercase_underscore pattern
    const tmp_headers_path = path.join(__dirname, 'temp_header_test.json');

    beforeEach(() => {
        parser = new HeaderParser();
        console_spy = jest.spyOn(console, 'error').mockImplementation();
        // Mocking log to verify the filename output requirement
        jest.spyOn(console, 'log').mockImplementation();
        exit_spy = jest.spyOn(process, 'exit').mockImplementation();
    });

    afterEach(() => {
        jest.restoreAllMocks();
        // --- CLEANUP: The "No-Trace" Protocol ---
        if (fs.existsSync(tmp_headers_path)) {
            fs.unlinkSync(tmp_headers_path);
        }
    });

    const create_test_file = (content) => {
        fs.writeFileSync(tmp_headers_path, JSON.stringify(content));
        return tmp_headers_path;
    };

    // --- GROUP 1: STRUCTURAL FIDELITY ---

    test('✅ Should correctly parse flat mode (all request)', () => {
        const file = create_test_file({ "X-Test": "Value" });
        const { requestHeaders, responseHeaders } = parser.parse(file);

        expect(requestHeaders['X-Test']).toBe("Value");
        expect(Object.keys(responseHeaders).length).toBe(0);
        expect(exit_spy).not.toHaveBeenCalled();
    });

    test('✅ Should correctly parse explicit mode (separated)', () => {
        const file = create_test_file({
            "requestHeaders": { "X-Req": "Yes" },
            "responseHeaders": { "X-Res": "Indeed" }
        });
        const { requestHeaders, responseHeaders } = parser.parse(file);

        expect(requestHeaders['X-Req']).toBe("Yes");
        expect(responseHeaders['X-Res']).toBe("Indeed");
    });

    // --- GROUP 2: AMBIGUITY TRAPS ---

    test('❌ Should fail on case-insensitive duplicate reserved keys', () => {
        const file = create_test_file({
            "requestHeaders": { "a": "b" },
            "REQUESTHEADERS": { "c": "d" }
        });
        parser.parse(file);

        expect(exit_spy).toHaveBeenCalledWith(1);
        expect(console_spy).toHaveBeenCalledWith(expect.stringContaining('Ambiguity Error'));
    });

    // --- GROUP 3: TYPE RIGIDITY ---

    test('❌ Should fail if a flat header value is a number', () => {
        const file = create_test_file({ "X-Timeout": 30 });
        parser.parse(file);

        expect(exit_spy).toHaveBeenCalledWith(1);
        expect(console_spy).toHaveBeenCalledWith(expect.stringContaining('must be a string'));
    });

    test('❌ Should fail if an explicit header value is an array', () => {
        const file = create_test_file({
            "responseHeaders": { "Set-Cookie": ["session=1", "user=2"] }
        });
        parser.parse(file);

        expect(exit_spy).toHaveBeenCalledWith(1);
        expect(console_spy).toHaveBeenCalledWith(expect.stringContaining('must be a string'));
    });

    // --- GROUP 4: LOGGING ---

    test('✅ Should log the filename in parentheses', () => {
        const file = create_test_file({ "a": "b" });
        const log_spy = jest.spyOn(console, 'log').mockImplementation();

        parser.parse(file);
        expect(log_spy).toHaveBeenCalledWith(expect.stringContaining('(temp_header_test.json)'));
    });
});
