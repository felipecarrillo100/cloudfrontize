import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['bin/cli.ts', 'src/index.ts'],
  format: ['cjs'],
  target: 'node22',
  splitting: false,
  sourcemap: false,
  clean: true,
  minify: true,
  bundle: true,
  // Types for the library entry (src/index.ts); the CLI needs none
  // (tsup sets baseUrl, which TypeScript 6 deprecates)
  dts: { entry: { 'src/index': 'src/index.ts' }, compilerOptions: { ignoreDeprecations: '6.0' } },
  banner: {
    js: '#!/usr/bin/env node',
  },
});
