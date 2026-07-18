import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Repository } from 'typeorm';
import { BaseService, type JsonApiSerializerAdapter } from '../src/base.service';

// Chainable query-builder stand-in whose terminal `getManyAndCount` is
// configurable, plus the internal `expressionMap` the sparse-fields path reads.
function makeQueryBuilder(result: [unknown[], number]) {
  const qb: Record<string, unknown> = {};
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
  qb.expressionMap = { selects: [], aliases: [] };
  qb.getQueryAndParameters = vi.fn(() => ['SQL', []]);
  qb.getManyAndCount = vi.fn(async () => result);
  return qb;
}

function makeRepository(qb: Record<string, unknown>) {
  return {
    metadata: { name: 'Photo' },
    createQueryBuilder: vi.fn(() => qb),
  } as unknown as Repository<{ id: string; title: string }>;
}

// A trivial serializer adapter: shapes a JSON:API-ish document and records how
// it was called, so we can assert the type/data/meta plumbed through.
function makeAdapter(): JsonApiSerializerAdapter & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    serialize(type, data, meta) {
      calls.push({ type, data, meta });
      const items = Array.isArray(data) ? data : [data];
      return {
        data: items.map((e) => {
          const { id, ...attributes } = e as { id: string };
          return { type, id, attributes };
        }),
        ...(meta ? { meta } : {}),
      };
    },
  };
}

type Photo = { id: string; title: string };

class PhotoService extends BaseService<Photo, Partial<Photo>, Partial<Photo>, unknown> {
  constructor(repository: Repository<Photo>, adapter: JsonApiSerializerAdapter) {
    super(repository, 'photo', {
      logging: { muteAll: true },
      serializer: { type: 'photos', adapter },
    });
  }
  // Expose protected helpers for direct assertions.
  publicToFetchSpecification(query: Parameters<PhotoService['toFetchSpecification']>[0]) {
    return this.toFetchSpecification(query);
  }
  publicBuildPaginationMeta(...args: Parameters<PhotoService['buildPaginationMeta']>) {
    return this.buildPaginationMeta(...args);
  }
}

describe('BaseService — folded pagination/serialization capabilities', () => {
  let qb: Record<string, unknown>;
  let adapter: ReturnType<typeof makeAdapter>;
  let service: PhotoService;

  beforeEach(() => {
    qb = makeQueryBuilder([[{ id: 'ph1', title: 'Alpha' }], 3]);
    adapter = makeAdapter();
    service = new PhotoService(makeRepository(qb), adapter);
  });

  describe('toFetchSpecification (schema-direct page mapping)', () => {
    it('maps nested page[number]/page[size] onto flat pageNumber/pageSize', () => {
      const spec = service.publicToFetchSpecification({
        page: { number: 2, size: 10 },
        sort: ['title'],
      });
      expect(spec.pageNumber).toBe(2);
      expect(spec.pageSize).toBe(10);
      expect(spec).not.toHaveProperty('page');
      expect(spec.sort).toEqual(['title']);
    });

    it('forces the id column into a sparse fieldset (ensureIdField)', () => {
      const spec = service.publicToFetchSpecification({ fields: ['title'] });
      expect(spec.fields).toEqual(['id', 'title']);
    });

    it('leaves a fieldset that already has the id untouched', () => {
      const spec = service.publicToFetchSpecification({ fields: ['id', 'title'] });
      expect(spec.fields).toEqual(['id', 'title']);
    });
  });

  describe('buildPaginationMeta', () => {
    it('reflects the requested page/size and the true total', () => {
      expect(service.publicBuildPaginationMeta(42, { pageNumber: 3, pageSize: 5 })).toEqual({
        totalItems: 42,
        page: 3,
        size: 5,
      });
    });

    it('falls back to the default page/size when unset', () => {
      expect(service.publicBuildPaginationMeta(3, {})).toEqual({
        totalItems: 3,
        page: 1,
        size: 25,
      });
    });

    it('coerces a non-positive page/size to the defaults (no negative skip)', () => {
      expect(service.publicBuildPaginationMeta(3, { pageNumber: 0, pageSize: 0 })).toEqual({
        totalItems: 3,
        page: 1,
        size: 25,
      });
    });

    it('reflects disablePagination as a single full page (size = totalItems)', () => {
      expect(
        service.publicBuildPaginationMeta(42, { disablePagination: true, pageSize: 10 }),
      ).toEqual({ totalItems: 42, page: 1, size: 42 });
    });
  });

  describe('findAllPaginated', () => {
    it('maps the wire query, runs findAll, and serializes with pagination meta', async () => {
      const doc = await service.findAllPaginated({ page: { number: 1, size: 2 }, sort: ['title'] });

      // pagination applied to the query
      expect(qb.take).toHaveBeenCalledWith(2);
      expect(qb.skip).toHaveBeenCalledWith(0);

      // serializer was handed the resolved type, the rows and the meta
      expect(adapter.calls).toEqual([
        {
          type: 'photos',
          data: [{ id: 'ph1', title: 'Alpha' }],
          meta: { totalItems: 3, page: 1, size: 2 },
        },
      ]);

      // and the collection document carries data + meta
      expect(doc.meta).toEqual({ totalItems: 3, page: 1, size: 2 });
      expect(doc.data).toEqual([{ type: 'photos', id: 'ph1', attributes: { title: 'Alpha' } }]);
    });
  });

  describe('pluggable serializer', () => {
    it('serialize() uses the injected adapter instead of jsona', async () => {
      const doc = await service.serialize({ id: 'ph1', title: 'Alpha' }, { totalItems: 1 });
      expect(adapter.calls).toHaveLength(1);
      expect(doc).toMatchObject({
        data: [{ type: 'photos', id: 'ph1', attributes: { title: 'Alpha' } }],
        meta: { totalItems: 1 },
      });
    });
  });
});
