import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node20',
  outDir: 'dist',
  // The library is consumed by NestJS apps that already bundle these.
  external: ['@nestjs/common', '@nestjs/core', 'typeorm', 'nestjs-typeorm-paginate'],
});
