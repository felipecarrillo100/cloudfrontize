export {};
const fs = require('fs');
const path = require('path');
const { renderSchemas, SCHEMA_DIR } = require('../scripts/generate-schema');

describe('Committed JSON Schemas', () => {
    test('match the zod schemas (run `npm run schema` after changing them)', () => {
        for (const [file, content] of Object.entries(renderSchemas())) {
            const committed = fs.readFileSync(path.join(SCHEMA_DIR, file), 'utf8');
            expect(committed).toBe(content);
        }
    });
});
