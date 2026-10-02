import fs from 'fs';

/**
 * Structured logging for CloudFrontize.
 *
 * @namespace Backend
 * Every record carries a level, a component and optional request id / fields. Sinks decide where
 * records go: the console (human-readable, through console.* so existing output and test spies keep
 * working), a log file (plain text, ANSI stripped), or — from the WebUI API v2 — the telemetry stream.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogRecord {
    time: Date;
    level: LogLevel;
    component: string;
    message: string;
    requestId?: string;
    fields?: Record<string, unknown>;
}

export interface LogSink {
    write(record: LogRecord): void;
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*m/g;

/** ANSI styling helpers, so color codes live in one place. */
export const style = {
    red: (s: string) => `\x1b[31m${s}\x1b[0m`,
    yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
    green: (s: string) => `\x1b[32m${s}\x1b[0m`,
    cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
    magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
    gray: (s: string) => `\x1b[90m${s}\x1b[0m`,
    bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
    strip: (s: string) => s.replace(ANSI, '')
};

/** Writes messages verbatim to console.log / warn / error by level. */
export class ConsoleSink implements LogSink {
    write(record: LogRecord): void {
        if (record.level === 'error') console.error(record.message);
        else if (record.level === 'warn') console.warn(record.message);
        else console.log(record.message);
    }
}

/** Appends plain-text lines (ANSI stripped) to a file stream. */
export class FileSink implements LogSink {
    constructor(private stream: fs.WriteStream) {}

    write(record: LogRecord): void {
        const fields = record.fields && Object.keys(record.fields).length ? ` ${JSON.stringify(record.fields)}` : '';
        const line = `${record.time.toISOString()}  [${record.requestId || '-'}]  [${record.level.toUpperCase()}]  [${record.component}]  ${style.strip(record.message)}${fields}\n`;
        try { this.stream.write(line); } catch { /* logging must never break a request */ }
    }
}

interface LoggerState {
    sinks: LogSink[];
    level: LogLevel;
}

export class Logger {
    private constructor(private state: LoggerState, public readonly component: string) {}

    static create(options: { level?: LogLevel; sinks?: LogSink[]; component?: string } = {}): Logger {
        return new Logger({ sinks: options.sinks ?? [new ConsoleSink()], level: options.level ?? 'info' }, options.component ?? 'cloudfrontize');
    }

    /** A logger for a sub-component that shares this logger's sinks and level. */
    child(component: string): Logger {
        return new Logger(this.state, component);
    }

    setLevel(level: LogLevel): void { this.state.level = level; }
    addSink(sink: LogSink): () => void {
        this.state.sinks.push(sink);
        return () => { this.state.sinks = this.state.sinks.filter(s => s !== sink); };
    }

    debug(message: string, fields?: Record<string, unknown>, requestId?: string) { this.log('debug', message, fields, requestId); }
    info(message: string, fields?: Record<string, unknown>, requestId?: string) { this.log('info', message, fields, requestId); }
    warn(message: string, fields?: Record<string, unknown>, requestId?: string) { this.log('warn', message, fields, requestId); }
    error(message: string, fields?: Record<string, unknown>, requestId?: string) { this.log('error', message, fields, requestId); }

    log(level: LogLevel, message: string, fields?: Record<string, unknown>, requestId?: string): void {
        if (LEVEL_ORDER[level] < LEVEL_ORDER[this.state.level]) return;
        const record: LogRecord = { time: new Date(), level, component: this.component, message, requestId, fields };
        for (const sink of this.state.sinks) sink.write(record);
    }
}

/** Process-wide default logger (console only). Servers create their own with extra sinks. */
export const defaultLogger = Logger.create();
