export interface PaginationSpecification {
  pageSize: number;
  pageNumber: number;
  disablePagination: boolean;
}

export interface FieldsAndIncludesSpecification {
  fields?: string[];
  omitFields?: string[];
  includes?: string[];
}

export interface SortSpecification {
  sort?: string[];
}

export type FetchSpecification = PaginationSpecification &
  FieldsAndIncludesSpecification &
  SortSpecification;
