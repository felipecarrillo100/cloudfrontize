/**
 * Single source of truth for the package version.
 * tsup/esbuild inlines package.json at bundle time; babel-jest and tsx resolve it at runtime.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
export const VERSION: string = require('../package.json').version;
