import { defineConfig } from 'tsup';

// Builds the SHARED single-source types barrel (`src/types/index.ts`) into this
// package's own dist. Pure types => the emitted .js/.cjs are empty shims; only
// the .d.ts/.d.cts carry meaning. No externals: nothing is imported from
// @nestjs/* or typeorm.
//
// Paths are resolved from the repo root, since this config is run via the root
// `build:types` script (`tsup --config packages/types/tsup.config.ts`).
export default defineConfig({
  entry: { index: 'src/types/index.ts' },
  outDir: 'packages/types/dist',
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node20',
});
