import EventEmitter from 'events';
import * as chokidar from 'chokidar';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { HookType, RunnerOptions, Registry } from './types';

/**
 * Abstract base class for hot-reloading Lambda@Edge and CFF handlers.
 * Centralizes filesystem watching, staged registry management, and atomic swaps.
 */
export abstract class HotRunner extends EventEmitter {
    protected runnerPath: string | null;
    public options: RunnerOptions;
    protected modules: Registry;
    protected envVars: Record<string, string>;
    protected bakeVars: Record<string, string>;
    protected logStream: fs.WriteStream | null = null;
    private ownsLogStream: boolean = false;
    private watcher: chokidar.FSWatcher | null = null;

    constructor(runnerPath: string | null, options: RunnerOptions = {}) {
        super();
        this.runnerPath = runnerPath ? path.resolve(runnerPath) : null;
        this.options = options;
        
        this.modules = {
            'viewer-request': [],
            'origin-request': [],
            'origin-response': [],
            'viewer-response': []
        };
        
        this.envVars = {};
        this.bakeVars = {};
        
        // Forensic Alignment: Prefer shared logStream from Orchestrator/startServer
        if (this.options.logStream) {
            this.logStream = this.options.logStream;
            this.ownsLogStream = false;
        } else if (this.options.logPath) {
            this._initLogFile(this.options.logPath);
            this.ownsLogStream = true;
        }
    }

    /**
     * Returns the current map of template variables used for baking.
     */
    public getBakeVars(): Record<string, string> {
        return { ...this.bakeVars };
    }

    private _initLogFile(logPath: string) {
        try {
            const dir = path.dirname(logPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            
            // Fidelity Fix: Ensure file is empty BEFORE creating stream (prevents race condition in tests)
            fs.writeFileSync(logPath, '');

            // Professional Fidelity: Use a persistent WriteStream for non-blocking asynchronous I/O
            this.logStream = fs.createWriteStream(logPath, { flags: 'a' });
        } catch (err: any) {
            console.warn(`\x1b[33m⚠️  [HotRunner] Failed to initialize log stream: ${err.message}\x1b[0m`);
        }
    }

    /**
     * Bootstraps the runner, performs initial load, and starts the watcher if enabled.
     */
    public async init(): Promise<void> {
        // load() is now called synchronously in the subclass constructor

        if (this.options.watch !== false) {
            this._watch();
        }
    }

    /**
     * Orchestrates the loading of environment, bake variables, and hook files.
     */
    public abstract load(changedFile?: string): void;

    /**
     * Subclasses implement specific sandbox/validation logic for individual files.
     */
    protected abstract _loadFile(filePath: string, registry: Registry): void;

    /**
     * Sets up the chokidar watcher for the runner path and config files.
     */
    protected _watch(): void {
        const targets: string[] = [];
        if (this.runnerPath && fs.existsSync(this.runnerPath)) targets.push(this.runnerPath);
        if (this.options.envPath && fs.existsSync(this.options.envPath)) targets.push(this.options.envPath);
        if (this.options.bakePath && fs.existsSync(this.options.bakePath)) targets.push(this.options.bakePath);

        if (targets.length === 0) return;

        this.watcher = chokidar.watch(targets, {
            ignoreInitial: true,
            awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 10 }
        });

        this.watcher.on('all', (event, filePath) => {
            if (this.options.verbose) {
                console.log(`\x1b[36m🔄 [HotRunner] ${event} detected: ${filePath}\x1b[0m`);
            }
            try {
                this.load(filePath);
            } catch (err: any) {
                console.error(`\x1b[31m🛑 [Watcher Error] ${err.message}\x1b[0m`);
            }
        });
    }

    /**
     * Gracefully closes the watcher.
     */
    public close(): void {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
        }
        if (this.logStream && this.ownsLogStream) {
            this.logStream.end();
            this.logStream = null;
        }
    }

    /**
     * Standardized .env loader for runners.
     */
    protected _loadEnv(envPath?: string): Record<string, string> {
        if (!envPath || !fs.existsSync(envPath)) return {};
        try {
            const parsed = dotenv.parse(fs.readFileSync(envPath));
            const { AWS_RUNTIME } = require('../constants');
            for (const k of Object.keys(parsed)) {
                if (!AWS_RUNTIME.ENV_WHITELIST.includes(k as any)) {
                    throw new Error(`Restricted Variable: "${k}" is not permitted in AWS Lambda@Edge`);
                }
            }
            return parsed;
        } catch (err: any) {
            console.error(`\x1b[31m🛑 [HotRunner] Env Load Error: ${err.message}\x1b[0m`);
            if (err.message.includes('Restricted Variable')) throw err;
            return {};
        }
    }

    /**
     * Standardized .bake loader for template variable injection.
     */
    protected _loadBake(bakePath?: string): Record<string, string> {
        if (!bakePath || !fs.existsSync(bakePath)) return {};
        try {
            return dotenv.parse(fs.readFileSync(bakePath));
        } catch (err: any) {
            console.error(`\x1b[31m🛑 [HotRunner] Bake Load Error: ${err.message}\x1b[0m`);
            return {};
        }
    }

    /**
     * Helper to clone registries to avoid shared state mutations during swaps.
     */
    protected _createEmptyRegistry(): Registry {
        return {
            'viewer-request': [],
            'origin-request': [],
            'origin-response': [],
            'viewer-response': []
        };
    }

    public getRunnerPath(): string | null {
        return this.runnerPath;
    }
}
