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
   */
  filter?: Record<string, unknown>;
}

export type FetchSpecification = PaginationSpecification &
  FieldsAndIncludesSpecification &
  SortSpecification &
  FiltersSpecification;
