import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['bin/cli.ts', 'src/index.ts'],
  format: ['cjs'],
  target: 'node20',
  splitting: false,
  sourcemap: false,
  clean: true,
  minify: true,
  bundle: true,
  dts: false,
  banner: {
    js: '#!/usr/bin/env node',
  },
});
