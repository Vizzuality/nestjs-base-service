import { SelectQueryBuilder } from 'typeorm';
import { FetchSpecification } from '../types/fetch-specification.interface';

import { Logger } from '@nestjs/common';
import { DEFAULT_PAGINATION } from '../config/default.config';
import { inspect } from 'util';

type SortDirection = 'ASC' | 'DESC';

/**
 * Utility functions for pagination, sorting, sparse fieldsets, etc.
 *
 * @debt Clean up all the legacy code, add documentation and tests.
 */
export class FetchUtils<T> {
  static processFetchSpecification<T>(
    query: SelectQueryBuilder<T>,
    aliasTable: string,
    {
      fields = undefined,
      omitFields = undefined,
      include = undefined,
      filter = undefined,
      pageNumber = DEFAULT_PAGINATION.pageNumber,
      pageSize = DEFAULT_PAGINATION.pageSize,
      disablePagination = DEFAULT_PAGINATION.disablePagination,
      sort = undefined,
    }: FetchSpecification = {
      fields: undefined,
      omitFields: undefined,
      include: undefined,
      filter: undefined,
      pageNumber: DEFAULT_PAGINATION.pageNumber,
      pageSize: DEFAULT_PAGINATION.pageSize,
      disablePagination: DEFAULT_PAGINATION.disablePagination,
      sort: undefined,
    }
  ) {
    Logger.debug(
      `Applying fetch specification: ${inspect({
        fields,
        omitFields,
        include,
        filter,
        pageNumber,
        pageSize,
        disablePagination,
        sort,
      })}`
    );

    const queryWithIncludedEntities = this.addIncludedEntities(query, aliasTable, { include });
    const queryWithSparseFieldsets = this.addFields(queryWithIncludedEntities, aliasTable, {
      fields,
    });
    const queryWithSorting = this.addSorting(queryWithSparseFieldsets, aliasTable, { sort });
    const queryWithPagination = disablePagination
      ? queryWithSorting
      : this.addPagination(queryWithSorting, aliasTable, {
          pageNumber,
          pageSize,
        });

    return queryWithPagination;
  }

  static addFields<T>(
    query: SelectQueryBuilder<T>,
    aliasTable: string,
    { fields = undefined }: Pick<FetchSpecification, 'fields'> = {
      fields: undefined,
    }
  ) {
    /**
     * Select fields as per fetch specification: if any fields are listed in the
     * `fields` list, only these will be included in the generated SQL query's
     * SELECT part.
     *
     * Fields from the `omitFields` list will still be included in the generated
     * query (we could not remove them cleanly without relying on TypeORM's
     * internals, see https://github.com/typeorm/typeorm/issues/535) and will be
     * removed from the results before.
     *
     * This is not ideal as we'd still query and receive over the wire
     * potentially large quantities of data which is then going to be discarded
     * (for example, large GeoJSON data from PostgreSQL geometry columns), and
     * it would obviously be cleaner to deal with the final list of `SELECT`ed
     * fields here, but at this stage the current solution should be a decent
     * tradeoff.
     */
    if (fields?.length > 0) {
      query.select(fields.map((f) => `${aliasTable}.${f}`));
    }

    return query;
  }

  static addIncludedEntities<T>(
    query: SelectQueryBuilder<T>,
    aliasTable: string,
    { include = undefined }: Pick<FetchSpecification, 'include'> = {
      include: undefined,
    }
  ) {
    /**
     * Select entities to be included as per fetch specification.
     */
    if (include && include.length > 0) {
      include.forEach((inc) => {
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
            if (include.indexOf(completed) === -1 || completed === inc) {
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
    return query;
  }

  static addSorting<T>(
    query: SelectQueryBuilder<T>,
    aliasTable: string,
    { sort = undefined }: Pick<FetchSpecification, 'sort'> = {
      sort: undefined,
    }
  ) {
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
        query.addOrderBy(`${aliasTable}.${sortByColumn}`, sortDirection);
      });
    }

    return query;
  }

  static addPagination<T>(
    query: SelectQueryBuilder<T>,
    aliasTable: string,
    {
      pageSize = DEFAULT_PAGINATION.pageSize,
      pageNumber = DEFAULT_PAGINATION.pageNumber,
    }: Pick<FetchSpecification, 'pageSize' | 'pageNumber'> = {
      pageSize: DEFAULT_PAGINATION.pageSize,
      pageNumber: DEFAULT_PAGINATION.pageNumber,
    }
  ) {
    /**
     * Apply pagination
     */
    query.take(pageSize);
    query.skip(pageSize * (pageNumber - 1));
    return query;
  }
}
