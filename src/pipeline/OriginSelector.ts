import { CacheBehavior } from '../core/types';

export class OriginSelector {
    private behaviors: { regex: RegExp; targetOriginId: string }[];

    constructor(behaviors: CacheBehavior[]) {
        this.behaviors = behaviors.map(b => ({
            regex: this._patternToRegex(b.pathPattern),
            targetOriginId: b.targetOriginId
        }));
    }

    public select(url: string, defaultOriginId: string): string {
        const path = url.split('?')[0];
        for (const b of this.behaviors) {
            if (b.regex.test(path)) {
                return b.targetOriginId;
            }
        }
        return defaultOriginId;
    }

    private _patternToRegex(pattern: string): RegExp {
        // CloudFront Path Pattern rules:
        // 1. '*' matches any characters.
        // 2. Exact matches are allowed.
        // 3. Patterns are case-sensitive (local choice, though AWS is too).
        
        const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&'); // Escape regex special chars except *
        const regexStr = '^' + escaped.replace(/\*/g, '.*') + '$';
        return new RegExp(regexStr);
    }
}
