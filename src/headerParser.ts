import fs from 'fs';
import path from 'path';
import { HeaderConfigError } from './project/errors';

export interface ParsedHeaders {
    requestHeaders: Record<string, string | null>;
    responseHeaders: Record<string, string | null>;
}

type ErrorReason = 'ambiguous' | 'not-string' | 'invalid-json';

class ReasonedHeaderError extends HeaderConfigError {
    constructor(message: string, filePath: string, public readonly reason: ErrorReason) {
        super(message, filePath);
    }
}

export class HeaderParser {
    /**
     * Reads a viewer headers file. Throws {@link HeaderConfigError} on invalid content, so servers
     * can report the problem without exiting. A missing file only warns and returns empty headers.
     */
    public load(headersPath?: string): ParsedHeaders {
        const result: ParsedHeaders = { requestHeaders: {}, responseHeaders: {} };
        if (!headersPath) return result;
        if (!fs.existsSync(headersPath)) {
            console.warn(`\x1b[33m⚠️  [HeaderParser] Warning: Header file not found at ${headersPath}\x1b[0m`);
            return result;
        }

        console.log(`Loading headers from: ${path.basename(headersPath)}`);

        let data: any;
        try {
            data = JSON.parse(fs.readFileSync(headersPath, 'utf8'));
        } catch (err: any) {
            throw new ReasonedHeaderError(`Failed to parse ${headersPath}: ${err.message}`, headersPath, 'invalid-json');
        }

        const lowerKeys = Object.keys(data).map(k => k.toLowerCase());
        if (new Set(lowerKeys).size !== lowerKeys.length) {
            throw new ReasonedHeaderError('Ambiguity Error: Case-insensitive duplicate keys found in root of JSON.', headersPath, 'ambiguous');
        }

        const copy = (source: Record<string, unknown>, target: Record<string, string | null>) => {
            for (const [k, v] of Object.entries(source || {})) {
                if (typeof v !== 'string') throw new ReasonedHeaderError(`Header value for ${k} must be a string.`, headersPath, 'not-string');
                target[k] = v;
            }
        };

        const hasReserved = lowerKeys.includes('requestheaders') || lowerKeys.includes('responseheaders');
        if (!hasReserved) {
            copy(data, result.requestHeaders);
        } else {
            const reqKey = Object.keys(data).find(k => k.toLowerCase() === 'requestheaders');
            const resKey = Object.keys(data).find(k => k.toLowerCase() === 'responseheaders');
            if (reqKey) copy(data[reqKey], result.requestHeaders);
            if (resKey) copy(data[resKey], result.responseHeaders);
        }
        return result;
    }

    /**
     * 2.x behavior: like {@link load}, but prints the problem and exits the process on invalid content.
     * @deprecated Use {@link load}, which throws instead of exiting.
     */
    public parse(headersPath?: string): ParsedHeaders {
        try {
            return this.load(headersPath);
        } catch (err: any) {
            if (!(err instanceof ReasonedHeaderError)) throw err;
            console.error(`\x1b[31m🛑 [HeaderParser] ${err.message}\x1b[0m`);
            // 2.x exited on these; for other JSON errors it continued with empty headers
            if (err.reason !== 'invalid-json' || err.message.includes('Unexpected token')) process.exit(1);
            return { requestHeaders: {}, responseHeaders: {} };
        }
    }
}
