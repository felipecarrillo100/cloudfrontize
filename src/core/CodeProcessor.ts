import { minify as terserMinify } from 'terser';

export type TransformationLevel = 'baked' | 'minified' | 'uglified';

/**
 * Unified Code Transformation Engine for CloudFrontize.
 * Handles variable substitution (baking), metadata stripping (cleaning),
 * and environment-aware minification/uglification.
 */
export class CodeProcessor {
  /**
   * Performs template variable substitution.
   * Uses split/join for safety against special characters like $.
   */
  public static bake(content: string, vars: Record<string, string>): string {
    let result = content;
    for (const [k, v] of Object.entries(vars)) {
      result = result.split(`__${k}__`).join(v);
    }
    return result;
  }

  /**
   * Strips CloudFrontize-specific metadata from the source.
   * Specifically targets 'exports.hookType = ...' lines.
   */
  public static clean(content: string): string {
    // Robust regex to match both module.exports and exports patterns
    const hookTypeRegex = /(?:module\.)?exports\.hookType\s*=\s*['"][^'"]+['"];?\s*\n?/g;
    return content.replace(hookTypeRegex, '').trim();
  }

  /**
   * Performs environment-aware minification and uglification.
   * Enforces strict ES5.1 compliance for CloudFront Functions (CFF).
   */
  public static async process(
    content: string, 
    type: 'cff' | 'edge', 
    level: TransformationLevel,
    bakeVars: Record<string, string> = {}
  ): Promise<string> {
    // Stage 1: Always Bake & Clean
    let processed = this.bake(content, bakeVars);
    processed = this.clean(processed);

    if (level === 'baked') return processed;

    // Stage 2 & 3: Minification (Terser)
    const isUglified = level === 'uglified';
    const isCff = type === 'cff';

    try {
      const result = await terserMinify(processed, {
        // Fidelity Guard: CFF requires strict ES5.1
        ecma: isCff ? 5 : 2020,
        compress: {
          ecma: isCff ? 5 : 2020,
          arrows: !isCff,          // DANGER: Never convert to arrows in CFF
          typeofs: false           // Avoid potentially risky typeof optimizations
        },
        mangle: isUglified ? {
          safari10: true,          // Max compatibility for older engines
          toplevel: true,
          reserved: [
            // AWS Entry Point
            'handler', 
            // AWS Event Structural Properties
            'event', 'Records', 'cf', 'request', 'response',
            // AWS Data Properties (The Contract)
            'headers', 'querystring', 'cookies', 'uri', 'method', 'status', 'body', 'statusDescription'
          ]
        } : false,
        format: {
          ecma: isCff ? 5 : 2020,
          beautify: false,
          comments: false          // Always strip comments in production mode
        }
      });

      return result.code || processed;
    } catch (err: any) {
      console.error(`🛑 [CodeProcessor] Minification Error: ${err.message}`);
      // Fallback to baked/cleaned code if minification fails
      return processed;
    }
  }
}
