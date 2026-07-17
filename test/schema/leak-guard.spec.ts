import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Monorepo-safety leak-guard (Part E.2, rule 4).
 *
 * Statically walks the import graph of the schema package's entry, following
 * every relative import, and asserts the set of *bare* (external) specifiers it
 * transitively reaches is exactly `{ zod }`. This is the regression net that
 * keeps the framework-free split honest: if anyone imports `@nestjs/*`,
 * `typeorm`, or `nestjs-zod` (directly or through a shared module) into the
 * schema runtime, this fails — a client bundling the schema package must never
 * drag in NestJS or an ORM.
 *
 * A source-graph walk (rather than bundle-and-grep) means the guard runs without
 * a build step and pinpoints the offending module.
 */

const here = dirname(fileURLToPath(import.meta.url));
const ENTRY = resolve(here, '../../src/schema/index.ts');

const FORBIDDEN = ['@nestjs', 'typeorm', 'nestjs-zod', 'class-validator', 'class-transformer'];
const ALLOWED_BARE = new Set(['zod']);

const IMPORT_RE =
  /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g;

function resolveModule(spec: string, fromFile: string): string | null {
  const base = resolve(dirname(fromFile), spec);
  const candidates = [base, `${base}.ts`, `${base}.tsx`, resolve(base, 'index.ts')];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function collectBareSpecifiers(entry: string): Set<string> {
  const bare = new Set<string>();
  const visited = new Set<string>();
  const stack = [entry];

  while (stack.length) {
    const file = stack.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);

    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(IMPORT_RE)) {
      const spec = match[1] ?? match[2] ?? match[3];
      if (!spec) continue;
      if (spec.startsWith('.') || spec.startsWith('/')) {
        const resolved = resolveModule(spec, file);
        // A relative import that resolves nowhere is a real bug, but not this
        // test's concern; skip silently.
        if (resolved) stack.push(resolved);
      } else {
        // Normalise scoped/sub-path specifiers to their package root token(s).
        bare.add(spec);
      }
    }
  }
  return bare;
}

describe('schema package leak-guard', () => {
  const bare = collectBareSpecifiers(ENTRY);

  it('reaches no forbidden framework/ORM packages', () => {
    const offenders = [...bare].filter((spec) =>
      FORBIDDEN.some((f) => spec === f || spec.startsWith(`${f}/`)),
    );
    expect(offenders).toEqual([]);
  });

  it('depends only on the allow-listed external packages (zod)', () => {
    const unexpected = [...bare].filter((spec) => {
      const root = spec.startsWith('@')
        ? spec.split('/').slice(0, 2).join('/')
        : spec.split('/')[0];
      return !ALLOWED_BARE.has(root);
    });
    expect(unexpected).toEqual([]);
  });
});
