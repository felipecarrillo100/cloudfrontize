import { CacheBehavior } from '../core/types';

/** A cache behavior with its compiled path pattern. */
export interface ResolvedBehavior extends CacheBehavior {
    key: string;
    regex: RegExp;
}

/**
 * Matches a request path to a cache behavior, the way CloudFront does: behaviors are evaluated in
 * order and the first match wins; the default behavior ("*") comes last.
 */
export class OriginSelector {
    private behaviors: ResolvedBehavior[];

    constructor(behaviors: CacheBehavior[]) {
        this.behaviors = behaviors.map((b, i) => ({
            ...b,
            key: b.key ?? (b.pathPattern === '*' && i === behaviors.length - 1 ? 'default' : b.pathPattern),
            regex: OriginSelector.patternToRegex(b.pathPattern)
        }));
    }

    /** The behavior that handles `url` (query string ignored), or undefined when none matches. */
    public match(url: string): ResolvedBehavior | undefined {
        const path = url.split('?')[0];
        return this.behaviors.find(b => b.regex.test(path));
    }

    public select(url: string, defaultOriginId: string): string {
        return this.match(url)?.targetOriginId ?? defaultOriginId;
    }

    public all(): ResolvedBehavior[] {
        return this.behaviors;
    }

    /**
     * CloudFront path patterns: `*` matches zero or more characters, `?` exactly one; everything
     * else is literal and case-sensitive.
     */
    static patternToRegex(pattern: string): RegExp {
        const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
        return new RegExp('^' + escaped.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
    }
}
