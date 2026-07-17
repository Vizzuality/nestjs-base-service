import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { buildFetchQuerySchema } from '../../src/schema/fetch-schema';

interface Photo {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  author: unknown;
}

const schema = buildFetchQuerySchema<Photo>()({
  columnsAllowedAsFilters: ['title', 'id'],
  columnsAllowedAsSearch: ['title'],
  columnsAllowedAsIncludes: ['author'],
  columnsAllowedAsSortable: ['title', 'createdAt', 'updatedAt'],
  columnsAllowedAsFields: ['id', 'title', 'createdAt', 'updatedAt'],
});

describe('buildFetchQuerySchema', () => {
  describe('disablePagination (no z.coerce.boolean footgun)', () => {
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

    it('parses uppercase/mixed-case "TRUE"/"False" (parity with the decorator)', () => {
      expect(schema.parse({ disablePagination: 'TRUE' }).disablePagination).toBe(true);
      expect(schema.parse({ disablePagination: 'True' }).disablePagination).toBe(true);
      expect(schema.parse({ disablePagination: 'False' }).disablePagination).toBe(false);
    });

    it('rejects non-boolean-ish strings and numbers', () => {
      for (const bad of ['yes', '1', '0', ''] as const) {
        expect(schema.safeParse({ disablePagination: bad }).success).toBe(false);
      }
      expect(schema.safeParse({ disablePagination: 1 }).success).toBe(false);
    });
  });

  describe('absent facets reject values (z.undefined fallback)', () => {
    // Only `sortable` is configured; every other facet must reject a supplied value.
    const sortOnly = buildFetchQuerySchema<Photo>()({ columnsAllowedAsSortable: ['title'] });

    it('accepts the configured facet', () => {
      expect(sortOnly.parse({ sort: ['title'] }).sort).toEqual(['title']);
    });

    it('rejects a filter when no filter columns are configured', () => {
      expect(sortOnly.safeParse({ filter: { title: 'x' } }).success).toBe(false);
    });

    it('rejects a search / include / fields when not configured', () => {
      expect(sortOnly.safeParse({ search: { title: 'x' } }).success).toBe(false);
      expect(sortOnly.safeParse({ include: ['author'] }).success).toBe(false);
      expect(sortOnly.safeParse({ fields: ['title'] }).success).toBe(false);
    });
  });

  describe('array / CSV tolerance', () => {
    it('accepts sort as a bracket array', () => {
      expect(schema.parse({ sort: ['title', '-createdAt'] }).sort).toEqual(['title', '-createdAt']);
    });

    it('accepts sort as a comma-separated string', () => {
      expect(schema.parse({ sort: 'title,-createdAt' }).sort).toEqual(['title', '-createdAt']);
    });

    it('accepts include/fields as arrays or CSV', () => {
      expect(schema.parse({ include: ['author'] }).include).toEqual(['author']);
      expect(schema.parse({ fields: 'id,title' }).fields).toEqual(['id', 'title']);
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
      const parsed = schema.parse({ filter: { title: 'Sunset' }, search: { title: 'sun' } });
      expect(parsed.filter).toEqual({ title: 'Sunset' });
      expect(parsed.search).toEqual({ title: 'sun' });
    });
  });

  describe('nested to-one paths', () => {
    interface Author {
      id: string;
      name: string;
    }
    interface Photo {
      id: string;
      title: string;
      author: Author;
    }
    interface Comment {
      id: string;
      body: string;
      photo: Photo;
    }

    const nested = buildFetchQuerySchema<Comment>()({
      columnsAllowedAsSortable: ['body', 'photo.title', 'photo.author.name'],
      columnsAllowedAsFilters: ['photo.title'],
      columnsAllowedAsSearch: ['photo.title'],
    });

    it('accepts a nested to-one sort path', () => {
      expect(nested.parse({ sort: ['photo.title'] }).sort).toEqual(['photo.title']);
      expect(nested.parse({ sort: ['-photo.author.name'] }).sort).toEqual(['-photo.author.name']);
    });

    it('rejects a nested path outside the allow-list', () => {
      expect(nested.safeParse({ sort: ['photo.secret'] }).success).toBe(false);
    });

    it('accepts a nested filter/search key', () => {
      expect(nested.parse({ filter: { 'photo.title': 'Sunset' } }).filter).toEqual({
        'photo.title': 'Sunset',
      });
      expect(nested.parse({ search: { 'photo.title': 'sun' } }).search).toEqual({
        'photo.title': 'sun',
      });
    });
  });

  it('merges an `extend` object into the schema', () => {
    const extended = buildFetchQuerySchema<Photo>()({
      columnsAllowedAsSortable: ['title'],
      extend: z.object({ authorId: z.string().optional() }),
    });
    const parsed = extended.parse({ authorId: 'author-1', sort: ['title'] });
    expect(parsed.authorId).toBe('author-1');
  });
});
