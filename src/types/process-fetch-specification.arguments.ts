export interface ProcessFetchSpecificationArguments {
  allowedFilters?: string[];
  /**
   * Entity properties that may be searched via partial, case-insensitive match
   * (`?search[<property>]=<term>` → SQL `ILIKE '%term%'`). A search key not in
   * this list throws, mirroring `allowedFilters`.
   */
  allowedSearch?: string[];
  /**
   * Columns (or to-one nested paths, e.g. `'photo.title'`) that may be sorted
   * on. A `sort` entry whose stripped path is not in this list throws.
   *
   * Sorting is otherwise interpolated into the ORDER BY, so gating it here (plus
   * the resolver's grammar check) closes what was previously a raw-sort SQL
   * injection vector. Strongly recommended whenever sorting is exposed.
   */
  allowedSort?: string[];
}
