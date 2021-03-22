export interface PaginationSpecification {
  pageSize: number;
  pageNumber: number;
  disablePagination: boolean;
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
  filter?: Record<string, unknown>;
}

export type FetchSpecification = PaginationSpecification &
  FieldsAndIncludesSpecification &
  SortSpecification &
  FiltersSpecification;
