import { SelectQueryBuilder } from 'typeorm';
import { FetchSpecification } from '../types/fetch-specification.interface';
import { DEFAULT_PAGINATION } from '../config/default.config';
import { resolveColumnRef } from './relation-path.util';

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
    },
    idProperty: string = 'id',
  ) {
    const queryWithIncludedEntities = this.addIncludedEntities(query, aliasTable, { include });
    const queryWithSparseFieldsets = this.addFields(
      queryWithIncludedEntities,
      aliasTable,
      { fields },
      idProperty,
    );
    const queryWithSorting = this.addSorting(
      queryWithSparseFieldsets,
      aliasTable,
      { sort },
      !disablePagination,
    );
    const queryWithPagination = disablePagination
      ? queryWithSorting
      : this.addPagination(queryWithSorting, aliasTable, {
          pageNumber,
          pageSize,
        });

    return queryWithPagination;
  }

  /**
   * Wrapper over processFetchSpecification(), for single entities.
   */
  static processSingleEntityFetchSpecification<T>(
    query: SelectQueryBuilder<T>,
    aliasTable: string,
    {
      fields = undefined,
      omitFields = undefined,
      include = undefined,
      filter = undefined,
    }: Pick<FetchSpecification, 'fields' | 'omitFields' | 'include' | 'filter'> = {
      fields: undefined,
      omitFields: undefined,
      include: undefined,
      filter: undefined,
    },
    idProperty: string = 'id',
  ) {
    return this.processFetchSpecification(
      query,
      aliasTable,
      {
        fields,
        omitFields,
        include,
        filter,
        disablePagination: true,
        pageNumber: undefined,
        pageSize: undefined,
      },
      idProperty,
    );
  }

  static addFields<T>(
    query: SelectQueryBuilder<T>,
    aliasTable: string,
    { fields = undefined }: Pick<FetchSpecification, 'fields'> = {
      fields: undefined,
    },
    idProperty: string = 'id',
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
      /**
       * Always select the id column. A sparse `SELECT` that omits it yields rows
       * with no id, which breaks JSON:API serialization; forcing it in here
       * means consumers need not repeat `id` in every `fields` list.
       */
      const columns = fields.includes(idProperty) ? fields : [idProperty, ...fields];

      /**
       * A sparse root fieldset must not drop columns contributed by joined
       * relations (an `include`, or a custom `.addSelect()` added in an
       * `extendFindAllQuery` override). `query.select()` resets the entire
       * SELECT list, so capture every selection that does NOT belong to the root
       * alias first, narrow the root columns, then re-add the captured ones —
       * `fields` and `include` thus compose instead of the fields clobbering the
       * join.
       */
      const preservedSelects = query.expressionMap.selects.filter(
        (select) => select.selection !== aliasTable,
      );
      query.select(columns.map((f) => `${aliasTable}.${f}`));
      for (const select of preservedSelects) {
        query.addSelect(select.selection, select.aliasName);
      }
    }

    return query;
  }

  static addIncludedEntities<T>(
    query: SelectQueryBuilder<T>,
    aliasTable: string,
    { include = undefined }: Pick<FetchSpecification, 'include'> = {
      include: undefined,
    },
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
            const alias = completed.replaceAll('.', '_');
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
    },
    applyPagination = false,
  ) {
    /**
     * Apply sorting. The column is routed through `resolveColumnRef`, which
     * grammar-checks the path and, for a nested to-one path (`rel.col`), joins
     * the relation chain (reusing any join `include` already created) and returns
     * the joined column reference. This also closes the previous raw-interpolation
     * vector: an unvalidated sort column can no longer reach the ORDER BY.
     */
    if (sort) {
      sort.forEach((s) => {
        // strip orderBy sigils ('+' or '-'), if present
        const sortByColumn = s.replace(/^[+-]/, '');
        // if the first character is '-', sort descending; otherwise, sort
        // ascending
        const sortDirection: SortDirection = s.match(/^-/) ? 'DESC' : 'ASC';
        const columnRef = resolveColumnRef(query, aliasTable, sortByColumn);

        /**
         * TypeORM's distinct-root pagination (the path taken by `take`/`skip`
         * whenever a join is present) requires every ORDER BY column to also be
         * in the SELECT, otherwise the generated distinct subquery references a
         * column it never selected. So when we ARE paginating and the sort column
         * lives on a JOINED relation (its ref is not on the root alias), add it to
         * the SELECT. Without pagination we leave the SELECT untouched, so a
         * nested sort does not hydrate the relation.
         *
         * Consequence: sorting by a nested relation column *with pagination*
         * selects that column, so the relation appears partially in results — use
         * `include` for that relation if you need it fully hydrated.
         */
        if (applyPagination && !columnRef.startsWith(`${aliasTable}.`)) {
          const relationAlias = columnRef.slice(0, columnRef.lastIndexOf('.'));
          // Skip if the relation (via `include`) or this exact column is already
          // selected, otherwise we'd emit a duplicate/ambiguous SELECT column.
          const alreadySelected = query.expressionMap.selects.some(
            (select) => select.selection === relationAlias || select.selection === columnRef,
          );
          if (!alreadySelected) {
            query.addSelect(columnRef);
          }
        }

        query.addOrderBy(columnRef, sortDirection);
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
    },
  ) {
    /**
     * Apply pagination
     */
    query.take(pageSize);
    query.skip(pageSize * (pageNumber - 1));
    return query;
  }
}
