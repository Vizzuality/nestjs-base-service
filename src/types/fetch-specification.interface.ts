export interface PaginationSpecification {
  pageSize?: number;
  pageNumber?: number;
  disablePagination?: boolean;
}

export interface FieldsAndIncludesSpecification {
  fields?: string[];
  omitFields?: string[];
  include?: string[];
}

export interface SortSpecification {
  sort?: string[];
}

export interface FiltersSpecification {
  /**
   * Filters supplied via query parameters, as parsed via
   * `FetchSpecificationMiddleware` or added later in the request lifecycle
   * (e.g. in services).
   *
   * All filter values are always added on the `filter` property as an array of
   * strings. Filters set directly by services may however have other shapes,
   * hence the `unknown` type here.
   *
   * Filters match values exactly (SQL `IN`). For case-insensitive partial
   * matching, see `search` in `PartialMatchSpecification`.
   */
  filter?: Record<string, unknown>;
}

export interface PartialMatchSpecification {
  /**
   * Partial-match search terms, keyed by entity property. Each value is matched
   * as a case-insensitive substring (SQL `ILIKE '%value%'`), unlike `filter`
   * which matches values exactly.
   *
   * Populated from `?search[<property>]=<term>` query params (whitelisted via
   * the decorator's `allowedSearch` option) or set directly by services. Each
   * value is treated as a single literal string — commas are NOT split, so a
   * term may contain them.
   */
  search?: Record<string, unknown>;
}

export type FetchSpecification = PaginationSpecification &
  FieldsAndIncludesSpecification &
  SortSpecification &
  FiltersSpecification &
  PartialMatchSpecification;
