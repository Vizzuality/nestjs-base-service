import { SelectQueryBuilder } from 'typeorm';
import { FetchSpecification } from '../types/fetch-specification.interface';

import { Logger } from '@nestjs/common';
import { DEFAULT_PAGINATION } from '../config/default.config';

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
      includes = undefined,
      pageSize = DEFAULT_PAGINATION.pageSize,
      pageNumber = DEFAULT_PAGINATION.pageNumber,
      sort = undefined,
    }: FetchSpecification = {
      fields: undefined,
      includes: undefined,
      pageSize: DEFAULT_PAGINATION.pageSize,
      pageNumber: DEFAULT_PAGINATION.pageNumber,
      sort: undefined,
    }
  ) {
    if (fields && fields.length > 0) {
      query.select(fields.map((f) => `${aliasTable}.${f}`));
    }
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
          query.leftJoinAndSelect(`${aliasTable}.${inc}`, inc);
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
      includes = undefined,
      pageSize = DEFAULT_PAGINATION.pageSize,
      pageNumber = DEFAULT_PAGINATION.pageNumber,
      sort = undefined,
    }: FetchSpecification = {
      fields: undefined,
      includes: undefined,
      pageSize: DEFAULT_PAGINATION.pageSize,
      pageNumber: DEFAULT_PAGINATION.pageNumber,
      sort: undefined,
    }
  ) {
    Logger.debug(`pagination: ${sort}`);
    if (fields && fields.length > 0) {
      query.select(fields.map((f) => `${aliasTable}.${f}`));
    }
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
                query.leftJoinAndSelect(`${aliasTable}.${element}`, alias);
              } else {
                query.leftJoinAndSelect(`${lastPart}.${element}`, alias);
              }
            }

            lastPart = alias;
          });
        } else {
          query.leftJoinAndSelect(`${aliasTable}.${inc}`, inc);
        }
      });
    }
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
    query.take(pageSize);
    query.skip(pageSize * (pageNumber - 1));
    return query;
  }
}
