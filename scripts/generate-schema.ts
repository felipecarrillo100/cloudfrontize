/**
 * Generates the JSON Schemas editors use for cloudfrontize.json and tutorial checks.json.
 * Run with `npm run schema`; __tests__/project_schema.test.ts fails when the committed files drift.
 */
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { ManifestSchema } from '../src/project/schema';
import { ChecksSchema } from '../src/project/checks';

export const SCHEMA_DIR = path.resolve(__dirname, '..', 'schema');

export function renderSchemas(): Record<string, string> {
    const render = (schema: z.ZodType, id: string, title: string) =>
        JSON.stringify({ ...z.toJSONSchema(schema, { io: 'input' }), $id: id, title }, null, 2) + '\n';
    return {
        'cloudfrontize.schema.json': render(ManifestSchema,
            'https://raw.githubusercontent.com/felipecarrillo100/cloudfrontize/main/schema/cloudfrontize.schema.json',
            'CloudFrontize project manifest'),
        'checks.schema.json': render(ChecksSchema,
            'https://raw.githubusercontent.com/felipecarrillo100/cloudfrontize/main/schema/checks.schema.json',
            'CloudFrontize tutorial checks')
    };
}

if (require.main === module) {
    fs.mkdirSync(SCHEMA_DIR, { recursive: true });
    for (const [file, content] of Object.entries(renderSchemas())) {
        fs.writeFileSync(path.join(SCHEMA_DIR, file), content);
        console.log(`Wrote schema/${file}`);
    }
}
