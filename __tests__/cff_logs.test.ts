export {};
const { truncateLogs } = require('../src/core/CFFRunner');

// "Function logs in CloudFront Functions are truncated at 10 KB" (Restrictions on CloudFront Functions)
describe('CloudFront Functions logs', () => {
    const entry = (...args: any[]) => ({ level: 'log', args, ts: 1 });

    test('logs within 10 KB are kept as they are', () => {
        const out = truncateLogs([entry('a', 1, { b: 2 }), entry('x'.repeat(10 * 1024 - 11))]);
        expect(out.map((l: any) => l.message)).toEqual(['a 1 {"b":2}', 'x'.repeat(10 * 1024 - 11)]);
    });

    test('the message that crosses 10 KB is cut, later ones are dropped, and a last line says so', () => {
        const out = truncateLogs([entry('x'.repeat(6000)), entry('y'.repeat(6000)), entry('dropped')]);
        expect(out).toHaveLength(3);
        expect(out[0].message).toHaveLength(6000);
        expect(out[1].message).toBe('y'.repeat(10 * 1024 - 6000));
        expect(out[2]).toMatchObject({ level: 'warn', message: '[CloudFrontize] Function logs truncated at 10 KB, as in CloudFront (this run logged 11.7 KB)' });
    });

    test('a cut never splits a character', () => {
        // "é" is 2 bytes in UTF-8: 10 KB minus 1 byte leaves room for 5119 of them, not half of one
        const out = truncateLogs([entry('a'), entry('é'.repeat(6000))]);
        expect(out[1].message).toBe('é'.repeat(5119));
        expect(out[2].level).toBe('warn');
    });
});
