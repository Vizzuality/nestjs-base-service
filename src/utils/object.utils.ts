/**
 * Tiny dependency-free replacements for the handful of lodash helpers this
 * library used. Kept internal (not re-exported from the package entry point).
 *
 * Dropping lodash removes a CommonJS-only dependency that broke named imports
 * in the ESM build (e.g. `import { castArray } from 'lodash'`).
 */

/** Shallow copy of `obj` without the given keys. Mirrors `lodash.omit`. */
export function omit<T extends object>(obj: T, keys: readonly string[]): Partial<T> {
  if (!obj) {
    return {} as Partial<T>;
  }
  const blocked = new Set(keys);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!blocked.has(key)) {
      result[key] = value;
    }
  }
  return result as Partial<T>;
}

/** Shallow copy of `obj` keeping only the given keys. Mirrors `lodash.pick`. */
export function pick<T extends object>(obj: T, keys: readonly string[]): Partial<T> {
  const result: Record<string, unknown> = {};
  if (!obj) {
    return result as Partial<T>;
  }
  const allowed = new Set(keys);
  for (const [key, value] of Object.entries(obj)) {
    if (allowed.has(key)) {
      result[key] = value;
    }
  }
  return result as Partial<T>;
}

/**
 * Shallow copy of `obj` keeping entries for which `predicate(value, key)` is
 * truthy. Mirrors `lodash.pickBy` (the predicate may throw to reject input).
 */
export function pickBy<T extends object>(
  obj: T | undefined,
  predicate: (value: unknown, key: string) => boolean,
): Partial<T> {
  const result: Record<string, unknown> = {};
  if (!obj) {
    return result as Partial<T>;
  }
  for (const [key, value] of Object.entries(obj)) {
    if (predicate(value, key)) {
      result[key] = value;
    }
  }
  return result as Partial<T>;
}
