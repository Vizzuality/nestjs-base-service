import { defineConfig } from 'tsup';

// Builds the SHARED single-source types barrel (`src/types/index.ts`) into this
// package's own dist. Pure types => the emitted .js/.cjs are empty shims; only
// the .d.ts/.d.cts carry meaning. No externals: nothing is imported from
// @nestjs/* or typeorm.
//
// Paths are resolved from the repo root, since this config is run via the root
// `build:types` script (`tsup --config packages/types/tsup.config.ts`).
export default defineConfig({
  // `index` is the pure types barrel (zero runtime); `query` carries the
  // fully-typed query builder + parser (built-ins only, still zero deps).
  entry: { index: 'src/types/index.ts', query: 'src/client/fetch-query.ts' },
  outDir: 'packages/types/dist',
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node20',
});
