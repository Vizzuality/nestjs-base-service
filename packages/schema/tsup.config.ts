import { defineConfig } from 'tsup';

// Builds the framework-free Zod runtime (`@vizzuality/base-service-schema`) from
// the shared source. The single entry is the schema barrel; the referenced pure
// types are inlined into the emitted .d.ts (same self-contained pattern as the
// types companion), so the only runtime dependency is `zod` — which is a peer and
// therefore externalised, never bundled.
//
// Paths resolve from the repo root, since this runs via the root `build:schema`
// script (`tsup --config packages/schema/tsup.config.ts`).
export default defineConfig({
  entry: { index: 'src/schema/index.ts' },
  outDir: 'packages/schema/dist',
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node20',
  // `zod` is a peer dependency: keep a single instance in the consumer's graph.
  // NOTHING from @nestjs/* or typeorm may appear here (enforced by the
  // leak-guard test) — this package must be safe in a client bundle.
  external: ['zod'],
});
