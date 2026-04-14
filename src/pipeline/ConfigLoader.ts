import fs from 'fs';
import path from 'path';
import { OriginConfig, CacheBehavior } from '../core/types';

export interface MultiOriginConfig {
    origins: OriginConfig[];
    behaviors: CacheBehavior[];
}

export class ConfigLoader {
    public static load(filePath: string): MultiOriginConfig {
        const fullPath = path.resolve(filePath);
        if (!fs.existsSync(fullPath)) {
            throw new Error(`S3 Configuration file not found: ${fullPath}`);
        }
        
        const content = fs.readFileSync(fullPath, 'utf8');
        const parsed = JSON.parse(content);

        // Standardize: if it's a single origin object, wrap it
        if (parsed.bucket && !parsed.origins) {
            return {
                origins: [{ ...parsed, type: 's3', id: 's3-origin', configFile: fullPath }],
                behaviors: [{ pathPattern: '*', targetOriginId: 's3-origin' }]
            };
        }

        if (parsed.origins) {
            parsed.origins = parsed.origins.map((o: any) => ({ ...o, configFile: fullPath }));
        }

        return { ...parsed, edge: (parsed as any).edge, cff: (parsed as any).cff, configFile: fullPath } as any;
    }

    public static fromCLI(options: any, directory?: string): any {
        const origins: OriginConfig[] = [];
        const behaviors: CacheBehavior[] = [];

        // Legacy compatibility: Standardize on 'local-origin' and 's3-origin' IDs
        // Many tests expect 'local-origin' to exist in the trace tree or telemetry.
        if (options.s3Origin) {
            origins.push({
                id: 's3-origin',
                type: 's3',
                bucket: options.s3Origin,
                endpoint: options.s3Endpoint,
                region: options.s3Region
            });
            behaviors.push({ pathPattern: '*', targetOriginId: 's3-origin' });
        } else if (directory) {
            origins.push({
                id: 'local-origin',
                type: 'local',
                directory: directory
            });
            behaviors.push({ pathPattern: '*', targetOriginId: 'local-origin' });
        }

        return { origins, behaviors, edge: options.edge, cff: options.cff };
    }
}
