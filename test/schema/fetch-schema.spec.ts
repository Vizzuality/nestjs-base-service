import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { buildFetchQuerySchema } from '../../src/schema/fetch-schema';

interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  organisation: unknown;
}

const schema = buildFetchQuerySchema<Project>()({
  columnsAllowedAsFilters: ['name', 'id'],
  columnsAllowedAsSearch: ['name'],
  columnsAllowedAsIncludes: ['organisation'],
  columnsAllowedAsSortable: ['name', 'createdAt', 'updatedAt'],
  columnsAllowedAsFields: ['id', 'name', 'createdAt', 'updatedAt'],
});

describe('buildFetchQuerySchema', () => {
  describe('disablePagination (B.4 — no z.coerce.boolean footgun)', () => {
    it('parses the string "false" to false (NOT true)', () => {
      expect(schema.parse({ disablePagination: 'false' }).disablePagination).toBe(false);
    });

    it('parses the string "true" to true', () => {
      expect(schema.parse({ disablePagination: 'true' }).disablePagination).toBe(true);
    });

    it('passes a real boolean through unchanged', () => {
      expect(schema.parse({ disablePagination: true }).disablePagination).toBe(true);
      expect(schema.parse({ disablePagination: false }).disablePagination).toBe(false);
    });

    it('rejects a non-boolean-ish string', () => {
      expect(schema.safeParse({ disablePagination: 'yes' }).success).toBe(false);
    });
  });

  describe('array / CSV tolerance', () => {
    it('accepts sort as a bracket array', () => {
      expect(schema.parse({ sort: ['name', '-createdAt'] }).sort).toEqual(['name', '-createdAt']);
    });

    it('accepts sort as a comma-separated string', () => {
      expect(schema.parse({ sort: 'name,-createdAt' }).sort).toEqual(['name', '-createdAt']);
    });

    it('accepts include/fields as arrays or CSV', () => {
      expect(schema.parse({ include: ['organisation'] }).include).toEqual(['organisation']);
      expect(schema.parse({ fields: 'id,name' }).fields).toEqual(['id', 'name']);
    });
  });

  describe('pagination', () => {
    it('coerces page[number]/page[size] from strings', () => {
      const parsed = schema.parse({ page: { number: '2', size: '10' } });
      expect(parsed.page).toEqual({ number: 2, size: 10 });
    });

    it('rejects a non-positive page size', () => {
      expect(schema.safeParse({ page: { size: '0' } }).success).toBe(false);
    });
  });

  describe('whitelisting', () => {
    it('rejects a sort value outside the allowed columns', () => {
      expect(schema.safeParse({ sort: ['notAColumn'] }).success).toBe(false);
    });

    it('rejects an unknown filter key (strict object)', () => {
      expect(schema.safeParse({ filter: { notAColumn: 'x' } }).success).toBe(false);
    });

    it('rejects an unknown search key (strict object)', () => {
      expect(schema.safeParse({ search: { notAColumn: 'x' } }).success).toBe(false);
    });

    it('accepts allowed filter/search keys', () => {
      const parsed = schema.parse({ filter: { name: 'Alpha' }, search: { name: 'alp' } });
      expect(parsed.filter).toEqual({ name: 'Alpha' });
      expect(parsed.search).toEqual({ name: 'alp' });
    });
  });

  describe('nested to-one paths (D.5)', () => {
    interface Org {
      id: string;
      name: string;
    }
    interface Proj {
      id: string;
      name: string;
      organisation: Org;
    }
    interface FarmT {
      id: string;
      name: string;
      project: Proj;
    }

    const nested = buildFetchQuerySchema<FarmT>()({
      columnsAllowedAsSortable: ['name', 'project.name', 'project.organisation.name'],
      columnsAllowedAsFilters: ['project.name'],
      columnsAllowedAsSearch: ['project.name'],
    });

    it('accepts a nested to-one sort path', () => {
      expect(nested.parse({ sort: ['project.name'] }).sort).toEqual(['project.name']);
      expect(nested.parse({ sort: ['-project.organisation.name'] }).sort).toEqual([
        '-project.organisation.name',
      ]);
    });

    it('rejects a nested path outside the allow-list', () => {
      expect(nested.safeParse({ sort: ['project.secret'] }).success).toBe(false);
    });

    it('accepts a nested filter/search key', () => {
      expect(nested.parse({ filter: { 'project.name': 'Acorn' } }).filter).toEqual({
        'project.name': 'Acorn',
      });
      expect(nested.parse({ search: { 'project.name': 'aco' } }).search).toEqual({
        'project.name': 'aco',
      });
    });
  });

  it('merges an `extend` object into the schema', () => {
    const extended = buildFetchQuerySchema<Project>()({
      columnsAllowedAsSortable: ['name'],
      extend: z.object({ organisationId: z.string().optional() }),
    });
    const parsed = extended.parse({ organisationId: 'org-1', sort: ['name'] });
    expect(parsed.organisationId).toBe('org-1');
  });
});
