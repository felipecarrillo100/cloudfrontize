import { HookType } from './types';

/**
 * HookUtility: The central authority for identifying Hook stages.
 * Harmonizes detection logic between the background Runners and the Orchestrator (UI).
 */
export class HookUtility {
    /**
     * Identifies the execution stage of a hook based on content metadata or filename.
     * Precedence: 
     * 1. exports.hookType = '...' (Source of Truth)
     * 2. Filename prefix (Convention)
     * 3. Default: viewer-response (Final fallback)
     */
    public static detectStage(content: string, filename: string): HookType {
        // 1. Check Content Metadata (The Contract)
        const typeMatch = content.match(/(?:module\.)?exports\.hookType\s*=\s*['"]([^'"]+)['"]/);
        if (typeMatch && typeMatch[1]) {
            const val = typeMatch[1].trim() as HookType;
            if (this._isValid(val)) return val;
        }

        // 2. Check Filename Prefix (The Convention)
        const name = filename.toLowerCase();
        if (name.includes('viewer-request')) return 'viewer-request';
        if (name.includes('viewer-response')) return 'viewer-response';
        if (name.includes('origin-request')) return 'origin-request';
        if (name.includes('origin-response')) return 'origin-response';

        // 3. Final Fallback (Professional Standard)
        return 'viewer-response';
    }

    private static _isValid(type: string): type is HookType {
        return ['viewer-request', 'origin-request', 'origin-response', 'viewer-response'].includes(type);
    }
}
