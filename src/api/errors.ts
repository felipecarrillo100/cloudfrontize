/**
 * An API error with an HTTP status and a stable machine-readable `code`. The router turns it into
 * `{ "error": { "code", "message", "details" } }`.
 */
export class ApiError extends Error {
    constructor(
        public readonly status: number,
        public readonly code: string,
        message: string,
        public readonly details?: unknown
    ) {
        super(message);
        this.name = 'ApiError';
    }

    static badRequest(message: string, details?: unknown) { return new ApiError(400, 'bad-request', message, details); }
    static notFound(message = 'Not found') { return new ApiError(404, 'not-found', message); }
    static conflict(message: string, details?: unknown) { return new ApiError(409, 'conflict', message, details); }
    static invalid(message: string, details?: unknown) { return new ApiError(422, 'invalid', message, details); }
}

/** The JSON body of every error response. */
export interface ApiErrorBody {
    error: { code: string; message: string; details?: unknown };
}
