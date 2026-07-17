import { describe, it, expect, vi } from 'vitest';
import type { SelectQueryBuilder } from 'typeorm';
import { FetchUtils } from '../../src/utils/fetch.utils';

/**
 * Minimal chainable stand-in for a TypeORM SelectQueryBuilder: every builder
 * method returns the same object so the fluent chain works, and each is a spy
 * we can assert against.
 */
function makeQueryBuilder() {
  const qb: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of [
    'select',
    'addSelect',
    'leftJoin',
    'leftJoinAndSelect',
    'addOrderBy',
    'take',
    'skip',
    'andWhere',
    'where',
    'setParameter',
  ]) {
    qb[method] = vi.fn(() => qb);
  }
  // Minimal stand-in for the internal expression map `addFields` inspects to
  // preserve joined-relation selections when narrowing a sparse root fieldset.
  (qb as Record<string, unknown>).expressionMap = { selects: [], aliases: [] };
  return qb as unknown as SelectQueryBuilder<unknown> & Record<string, ReturnType<typeof vi.fn>>;
}

describe('FetchUtils', () => {
  describe('addFields', () => {
    it('selects the requested fields (with the id column forced in), prefixed with the alias', () => {
      const qb = makeQueryBuilder();
      FetchUtils.addFields(qb, 'item', { fields: ['name', 'status'] });
      expect(qb.select).toHaveBeenCalledWith(['item.id', 'item.name', 'item.status']);
    });

    it('does not duplicate the id column when it is already requested', () => {
      const qb = makeQueryBuilder();
      FetchUtils.addFields(qb, 'item', { fields: ['id', 'name'] });
      expect(qb.select).toHaveBeenCalledWith(['item.id', 'item.name']);
    });

    it('honours a custom idProperty', () => {
      const qb = makeQueryBuilder();
      FetchUtils.addFields(qb, 'item', { fields: ['name'] }, 'uuid');
      expect(qb.select).toHaveBeenCalledWith(['item.uuid', 'item.name']);
    });

    it('re-adds joined-relation selections so a sparse fieldset keeps includes', () => {
      const qb = makeQueryBuilder();
      // Simulate an `include` having added a joined relation to the SELECT list.
      (qb as unknown as { expressionMap: { selects: unknown[] } }).expressionMap.selects = [
        { selection: 'item', aliasName: undefined },
        { selection: 'organisation', aliasName: undefined },
      ];
      FetchUtils.addFields(qb, 'item', { fields: ['name'] });
      expect(qb.select).toHaveBeenCalledWith(['item.id', 'item.name']);
      expect(qb.addSelect).toHaveBeenCalledWith('organisation', undefined);
    });

    it('does not call select when no fields are given', () => {
      const qb = makeQueryBuilder();
      FetchUtils.addFields(qb, 'item', { fields: [] });
      expect(qb.select).not.toHaveBeenCalled();
    });
  });

  describe('addSorting', () => {
    it('sorts ascending by default and descending for a leading "-"', () => {
      const qb = makeQueryBuilder();
      FetchUtils.addSorting(qb, 'item', { sort: ['name', '-createdAt', '+age'] });
      expect(qb.addOrderBy).toHaveBeenNthCalledWith(1, 'item.name', 'ASC');
      expect(qb.addOrderBy).toHaveBeenNthCalledWith(2, 'item.createdAt', 'DESC');
      expect(qb.addOrderBy).toHaveBeenNthCalledWith(3, 'item.age', 'ASC');
    });

    it('does nothing when sort is undefined', () => {
      const qb = makeQueryBuilder();
      FetchUtils.addSorting(qb, 'item', { sort: undefined });
      expect(qb.addOrderBy).not.toHaveBeenCalled();
    });
  });

  describe('addPagination', () => {
    it('translates page number/size into take + skip', () => {
      const qb = makeQueryBuilder();
      FetchUtils.addPagination(qb, 'item', { pageSize: 10, pageNumber: 3 });
      expect(qb.take).toHaveBeenCalledWith(10);
      expect(qb.skip).toHaveBeenCalledWith(20); // 10 * (3 - 1)
    });

    it('applies the default page (size 25, page 1 → skip 0)', () => {
      const qb = makeQueryBuilder();
      FetchUtils.addPagination(qb, 'item');
      expect(qb.take).toHaveBeenCalledWith(25);
      expect(qb.skip).toHaveBeenCalledWith(0);
    });
  });

  describe('addIncludedEntities', () => {
    it('left-joins a simple relation onto the root alias', () => {
      const qb = makeQueryBuilder();
      FetchUtils.addIncludedEntities(qb, 'item', { include: ['tags'] });
      expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('item.tags', 'tags');
    });

    it('left-joins nested relations with underscore-joined aliases', () => {
      const qb = makeQueryBuilder();
      FetchUtils.addIncludedEntities(qb, 'item', { include: ['author.profile'] });
      expect(qb.leftJoinAndSelect).toHaveBeenNthCalledWith(1, 'item.author', 'author');
      expect(qb.leftJoinAndSelect).toHaveBeenNthCalledWith(2, 'author.profile', 'author_profile');
    });

    it('handles three-level nesting with fully underscored aliases', () => {
      const qb = makeQueryBuilder();
      FetchUtils.addIncludedEntities(qb, 'item', { include: ['author.profile.avatar'] });
      expect(qb.leftJoinAndSelect).toHaveBeenNthCalledWith(1, 'item.author', 'author');
      expect(qb.leftJoinAndSelect).toHaveBeenNthCalledWith(2, 'author.profile', 'author_profile');
      expect(qb.leftJoinAndSelect).toHaveBeenNthCalledWith(
        3,
        'author_profile.avatar',
        'author_profile_avatar',
      );
    });

    it('does not double-join when a parent path is also requested explicitly', () => {
      const qb = makeQueryBuilder();
      FetchUtils.addIncludedEntities(qb, 'item', { include: ['author', 'author.profile'] });
      const joined = (qb.leftJoinAndSelect as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[1]);
      // each alias is joined at most once
      expect(new Set(joined).size).toBe(joined.length);
    });
  });

  describe('processFetchSpecification', () => {
    it('applies pagination when not disabled', () => {
      const qb = makeQueryBuilder();
      FetchUtils.processFetchSpecification(qb, 'item', { pageSize: 5, pageNumber: 2 });
      expect(qb.take).toHaveBeenCalledWith(5);
      expect(qb.skip).toHaveBeenCalledWith(5);
    });

    it('skips pagination when disablePagination is true', () => {
      const qb = makeQueryBuilder();
      FetchUtils.processFetchSpecification(qb, 'item', { disablePagination: true });
      expect(qb.take).not.toHaveBeenCalled();
      expect(qb.skip).not.toHaveBeenCalled();
    });
  });

  describe('processSingleEntityFetchSpecification', () => {
    it('never paginates a single-entity query', () => {
      const qb = makeQueryBuilder();
      FetchUtils.processSingleEntityFetchSpecification(qb, 'item', { fields: ['name'] });
      expect(qb.select).toHaveBeenCalledWith(['item.id', 'item.name']);
      expect(qb.take).not.toHaveBeenCalled();
      expect(qb.skip).not.toHaveBeenCalled();
    });
  });
});
