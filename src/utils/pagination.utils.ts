import { SelectQueryBuilder } from 'typeorm';
import { FetchSpecification } from '../types/fetch-specification.interface';

import { Logger } from '@nestjs/common';
import { DEFAULT_PAGINATION } from '../config/default.config';
import { SetUtils } from './set.utils';

type SortDirection = 'ASC' | 'DESC';

/**
 * Utility functions for pagination, sorting, sparse fieldsets, etc.
 *
 * @debt Clean up all the legacy code, add documentation and tests.
 */
export class PaginationUtils<T> {
  static addIncludesFields<T>(
    query: SelectQueryBuilder<T>,
    aliasTable: string,
    {
      fields = undefined,
      omitFields = undefined,
      includes = undefined,
      pageSize = DEFAULT_PAGINATION.pageSize,
      pageNumber = DEFAULT_PAGINATION.pageNumber,
      sort = undefined,
    }: FetchSpecification = {
      fields: undefined,
      omitFields: undefined,
      includes: undefined,
      pageSize: DEFAULT_PAGINATION.pageSize,
      pageNumber: DEFAULT_PAGINATION.pageNumber,
      sort: undefined,
    }
  ) {
    /**
     * Select fields as per fetch specification: fields from the `fields`
     * list will be included, less those in the `omitFields` list.
     */
    const pickFields = SetUtils.difference(fields, omitFields);
    query.select(pickFields.map((f) => `"${aliasTable}"."${f}"`));

    /**
     * Select entities to be included as per fetch specification.
     */
    if (includes && includes.length > 0) {
      includes.forEach((inc) => {
        const parts = inc.split('.');
        let lastPart = null;
        let completed = '';
        if (parts.length > 1) {
          parts.forEach((element, index) => {
            if (index > 0) {
              completed += '.';
            }
            completed += element;
            const alias = completed.replace('.', '_');
            if (includes.indexOf(completed) === -1 || completed === inc) {
              if (index === 0) {
                query.leftJoinAndSelect(`"${aliasTable}"."${element}"`, alias);
              } else {
                query.leftJoinAndSelect(`"${lastPart}"."${element}"`, alias);
              }
            }

            lastPart = alias;
          });
        } else {
          query.leftJoinAndSelect(`"${aliasTable}"."${inc}"`, inc);
        }
      });
    }
    return query;
  }

  static addPagination<T>(
    query: SelectQueryBuilder<T>,
    aliasTable: string,
    {
      fields = undefined,
      omitFields = undefined,
      includes = undefined,
      pageSize = DEFAULT_PAGINATION.pageSize,
      pageNumber = DEFAULT_PAGINATION.pageNumber,
      sort = undefined,
    }: FetchSpecification = {
      fields: undefined,
      omitFields: undefined,
      includes: undefined,
      pageSize: DEFAULT_PAGINATION.pageSize,
      pageNumber: DEFAULT_PAGINATION.pageNumber,
      sort: undefined,
    }
  ) {
    Logger.debug(`pagination: ${sort}`);
    /**
     * Select fields as per fetch specification: fields from the `fields`
     * list will be included, less those in the `omitFields` list.
     */
    const pickFields = SetUtils.difference(fields, omitFields);
    query.select(pickFields.map((f) => `"${aliasTable}"."${f}"`));

    /**
     * Select entities to be included as per fetch specification.
     */
    if (includes && includes.length > 0) {
      includes.forEach((inc) => {
        const parts = inc.split('.');
        let lastPart = null;
        let completed = '';
        if (parts.length > 1) {
          parts.forEach((element, index) => {
            if (index > 0) {
              completed += '.';
            }
            completed += element;
            const alias = completed.replace('.', '_');
            if (includes.indexOf(completed) === -1 || completed === inc) {
              if (index === 0) {
                query.leftJoinAndSelect(`"${aliasTable}"."${element}"`, alias);
              } else {
                query.leftJoinAndSelect(`"${lastPart}"."${element}"`, alias);
              }
            }

            lastPart = alias;
          });
        } else {
          query.leftJoinAndSelect(`"${aliasTable}"."${inc}"`, inc);
        }
      });
    }

    /**
     * Apply sorting
     */
    if (sort) {
      sort.map((s) => {
        // strip orderBy sigils ('+' or '-'), if present
        const sortByColumn = s.replace(/^[+-]/, '');
        // if the first character is '-', sort descending; otherwise, sort
        // ascending
        const sortDirection: SortDirection = s.match(/^-/) ? 'DESC' : 'ASC';
        query.addOrderBy(`"${aliasTable}"."${sortByColumn}"`, sortDirection);
      });
    }

    /**
     * Apply pagination
     */
    query.take(pageSize);
    query.skip(pageSize * (pageNumber - 1));
    return query;
  }
}
