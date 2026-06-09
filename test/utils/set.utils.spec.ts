import { describe, it, expect } from 'vitest';
import { SetUtils } from '../../src/utils/set.utils';

describe('SetUtils.difference', () => {
  it('returns elements in a that are not in b', () => {
    expect(SetUtils.difference([1, 2, 3], [2])).toStrictEqual([1, 3]);
  });

  it('removes duplicates by definition', () => {
    expect(SetUtils.difference([1, 1, 2, 2], [2])).toStrictEqual([1]);
  });

  it('returns an empty array when everything is excluded', () => {
    expect(SetUtils.difference([1, 2], [1, 2])).toStrictEqual([]);
  });

  it('works with strings', () => {
    expect(SetUtils.difference(['a', 'b', 'c'], ['b', 'c'])).toStrictEqual(['a']);
  });
});
