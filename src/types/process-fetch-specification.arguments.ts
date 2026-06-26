export interface ProcessFetchSpecificationArguments {
  allowedFilters?: string[];
  /**
   * Entity properties that may be searched via partial, case-insensitive match
   * (`?search[<property>]=<term>` → SQL `ILIKE '%term%'`). A search key not in
   * this list throws, mirroring `allowedFilters`.
   */
  allowedSearch?: string[];
}
