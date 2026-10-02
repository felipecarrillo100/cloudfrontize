import { z } from 'zod';

/**
 * Declarative request/response checks (`checks.json`), used by the tutorial runner to verify that
 * each tutorial project behaves as its article says. Header names are matched case-insensitively.
 */
const Check = z.strictObject({
    name: z.string().min(1),
    request: z.strictObject({
        method: z.string().default('GET'),
        path: z.string().startsWith('/'),
        headers: z.record(z.string(), z.string()).prefault({}),
        body: z.string().optional()
    }),
    expect: z.strictObject({
        status: z.number().int().optional(),
        headers: z.record(z.string(), z.string()).optional().describe('Exact header values'),
        headersContain: z.record(z.string(), z.string()).optional().describe('Header values that must contain the text'),
        headersAbsent: z.array(z.string()).optional(),
        bodyContains: z.union([z.string(), z.array(z.string())]).optional(),
        bodyNotContains: z.union([z.string(), z.array(z.string())]).optional()
    })
});

export const ChecksSchema = z.strictObject({
    $schema: z.string().optional(),
    checks: z.array(Check).min(1)
});

export type ChecksFile = z.output<typeof ChecksSchema>;
export type CheckDefinition = ChecksFile['checks'][number];
