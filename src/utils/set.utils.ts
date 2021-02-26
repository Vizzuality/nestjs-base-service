export class SetUtils {
  /**
   * Calculate the set difference between two arrays.
   *
   * Note that by definition duplicate elements will be removed.
   */
  static difference(a: unknown[], b: any[]): unknown[] {
    const setA = new Set(a);
    const setB = new Set(b);
    return Array.from(new Set([...setA].filter((x) => !setB.has(x))));
  }
}
