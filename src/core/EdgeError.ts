/**
 * An error raised by a CloudFront Function or Lambda@Edge hook, carrying the HTTP status
 * CloudFront would answer the viewer with.
 *
 * AWS Parity (CloudFront troubleshooting docs): a function *validation* error (malformed response,
 * read-only/forbidden header mutation) is a 502; a function *execution* error (thrown exception,
 * rejected promise, exceeded limit) is a 503. The `code` strings are this emulator's labels.
 */
export class EdgeError extends Error {
    constructor(
        public readonly status: 502 | 503,
        public readonly code: string,
        message: string
    ) {
        super(message);
        this.name = 'EdgeError';
    }

    static execution(kind: 'lambda' | 'function', message: string): EdgeError {
        return new EdgeError(503, kind === 'lambda' ? 'LambdaExecutionError' : 'FunctionExecutionError', message);
    }

    static validation(kind: 'lambda' | 'function', message: string): EdgeError {
        return new EdgeError(502, kind === 'lambda' ? 'LambdaValidationError' : 'FunctionValidationError', message);
    }
}
