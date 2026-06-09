import { describe, it, expect } from 'vitest';
import { omit, pick, pickBy } from '../../src/utils/object.utils';

describe('object.utils', () => {
  describe('omit', () => {
    it('removes the given keys, keeping the rest', () => {
      expect(omit({ a: 1, b: 2, c: 3 }, ['b'])).toStrictEqual({ a: 1, c: 3 });
    });

    it('returns a shallow copy (does not mutate the source)', () => {
      const src = { a: 1, b: 2 };
      const out = omit(src, ['a']);
      expect(out).toStrictEqual({ b: 2 });
      expect(src).toStrictEqual({ a: 1, b: 2 });
    });

    it('is a no-op when no keys match', () => {
      expect(omit({ a: 1 }, ['x'])).toStrictEqual({ a: 1 });
    });

    it('returns an empty object for nullish input', () => {
      expect(omit(null as unknown as object, ['a'])).toStrictEqual({});
    });
  });

  describe('pick', () => {
    it('keeps only the given keys', () => {
      expect(pick({ a: 1, b: 2, c: 3 }, ['a', 'c'])).toStrictEqual({ a: 1, c: 3 });
    });

    it('ignores keys that are absent', () => {
      expect(pick({ a: 1 }, ['a', 'missing'])).toStrictEqual({ a: 1 });
    });

    it('returns an empty object for nullish input', () => {
      expect(pick(null as unknown as object, ['a'])).toStrictEqual({});
    });
  });

  describe('pickBy', () => {
    it('keeps entries for which the predicate returns true', () => {
      expect(pickBy({ a: 1, b: 2, c: 3 }, (v) => (v as number) > 1)).toStrictEqual({
        b: 2,
        c: 3,
      });
    });

    it('passes both value and key to the predicate', () => {
      expect(pickBy({ keep: 1, drop: 2 }, (_v, k) => k === 'keep')).toStrictEqual({ keep: 1 });
    });

    it('propagates a throwing predicate (used to reject invalid filter keys)', () => {
      expect(() =>
        pickBy({ bad: 1 }, (_v, k) => {
          throw new Error(`Invalid filter key: ${k}`);
        }),
      ).toThrowError('Invalid filter key: bad');
    });

    it('returns an empty object for nullish input', () => {
      expect(pickBy(undefined, () => true)).toStrictEqual({});
    });
  });
});
