import {
  FieldsAndIncludesSpecification,
  PaginationSpecification,
  SortSpecification,
} from '../types/fetch-specification.interface';

export const DEFAULT_PAGINATION: PaginationSpecification = {
  pageSize: 25,
  pageNumber: 1,
  disablePagination: false,
};

export const DEFAULT_FIELDS_AND_INCLUDE_SPECIFICATION: FieldsAndIncludesSpecification = {
  fields: [],
  include: [],
};

export const DEFAULT_SORT_SPECIFICATION: SortSpecification = {
  sort: [],
};
