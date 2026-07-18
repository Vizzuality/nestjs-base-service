import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // swc honours tsconfig's experimentalDecorators + emitDecoratorMetadata, which
  // esbuild (Vitest's default transform) does NOT — required for NestJS
  // decorators / DI metadata to survive into the test runtime.
  plugins: [swc.vite()],
  // Vitest 4 transforms with Oxc by default; disable it so the swc plugin owns
  // transformation (and thus emits decorator metadata).
  oxc: false,
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/**/*.spec.ts'],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
