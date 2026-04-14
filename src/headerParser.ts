import fs from 'fs';
import path from 'path';

export interface ParsedHeaders {
    requestHeaders: Record<string, string | null>;
    responseHeaders: Record<string, string | null>;
}

export class HeaderParser {
    public parse(headersPath?: string): ParsedHeaders {
        const result: ParsedHeaders = { requestHeaders: {}, responseHeaders: {} };
        if (!headersPath) return result;
        if (!fs.existsSync(headersPath)) {
            console.warn(`\x1b[33m⚠️  [HeaderParser] Warning: Header file not found at ${headersPath}\x1b[0m`);
            return result;
        }

        console.log(`Loading headers from: ${path.basename(headersPath)}`);
        
        try {
            const content = fs.readFileSync(headersPath, 'utf8');
            const data = JSON.parse(content);
            const lowerKeys = Object.keys(data).map(k => k.toLowerCase());
            
            if (new Set(lowerKeys).size !== lowerKeys.length) {
                console.error(`\x1b[31m🛑 [HeaderParser] Ambiguity Error: Case-insensitive duplicate keys found in root of JSON.\x1b[0m`);
                process.exit(1);
            }

            const hasReserved = lowerKeys.includes('requestheaders') || lowerKeys.includes('responseheaders');

            if (!hasReserved) {
                for (const [k, v] of Object.entries(data)) {
                    if (typeof v !== 'string') {
                        console.error(`\x1b[31m🛑 [HeaderParser] Header value for ${k} must be a string.\x1b[0m`);
                        process.exit(1);
                    }
                    result.requestHeaders[k] = v as string;
                }
            } else {
                const reqKey = Object.keys(data).find(k => k.toLowerCase() === 'requestheaders');
                const resKey = Object.keys(data).find(k => k.toLowerCase() === 'responseheaders');

                if (reqKey) {
                    for (const [k, v] of Object.entries((data as any)[reqKey] || {})) {
                        if (typeof v !== 'string') {
                            console.error(`\x1b[31m🛑 [HeaderParser] Header value for ${k} must be a string.\x1b[0m`);
                            process.exit(1);
                        }
                        result.requestHeaders[k] = v as string;
                    }
                }
                if (resKey) {
                    for (const [k, v] of Object.entries((data as any)[resKey] || {})) {
                        if (typeof v !== 'string') {
                            console.error(`\x1b[31m🛑 [HeaderParser] Header value for ${k} must be a string.\x1b[0m`);
                            process.exit(1);
                        }
                        result.responseHeaders[k] = v as string;
                    }
                }
            }
        } catch (err: any) {
            console.error(`\x1b[31m🛑 [HeaderParser] Failed to parse ${headersPath}: ${err.message}\x1b[0m`);
            if (err.message.includes('Unexpected token')) process.exit(1);
        }

        return result;
    }
}
