import { describe, it, expect } from 'vitest';
import { createFetchQuery, parseFetchQuery } from './fetch-query';

interface User {
  id: string;
  name: string;
  email: string;
  status: string;
  role: string;
  createdAt: string;
}

describe('createFetchQuery', () => {
  describe('immutability', () => {
    it('returns a new builder per call, leaving the original untouched', () => {
      const base = createFetchQuery<User>();
      const next = base.filter({ status: 'active' });
      expect(base).not.toBe(next);
      expect(base.toSearchParams().toString()).toBe('');
      expect(next.toQueryString()).toBe('filter%5Bstatus%5D=active');
    });
  });

  describe('toSpecification', () => {
    it('encodes sort sigils (ASC = bare key, DESC = -key) and preserves order', () => {
      const spec = createFetchQuery<User>()
        .sort('createdAt', 'DESC')
        .sort('name')
        .toSpecification();
      expect(spec.sort).toStrictEqual(['-createdAt', 'name']);
    });

    it('normalizes filter values to string arrays (single -> one element)', () => {
      const spec = createFetchQuery<User>()
        .filter({ status: 'active', role: ['admin', 'editor'] })
        .toSpecification();
      expect(spec.filter).toStrictEqual({ status: ['active'], role: ['admin', 'editor'] });
    });

    it('stringifies number/boolean filter values', () => {
      const spec = createFetchQuery<{ count: number; flag: boolean }>()
        .filter({ count: 5, flag: true })
        .toSpecification();
      expect(spec.filter).toStrictEqual({ count: ['5'], flag: ['true'] });
    });

    it('keeps search terms as single literal strings', () => {
      const spec = createFetchQuery<User>().search({ name: 'ada', email: 42 }).toSpecification();
      expect(spec.search).toStrictEqual({ name: 'ada', email: '42' });
    });

    it('merges successive filter and search calls', () => {
      const spec = createFetchQuery<User>()
        .filter({ status: 'active' })
        .filter({ role: 'admin' })
        .search({ name: 'a' })
        .search({ email: 'b' })
        .toSpecification();
      expect(spec.filter).toStrictEqual({ status: ['active'], role: ['admin'] });
      expect(spec.search).toStrictEqual({ name: 'a', email: 'b' });
    });

    it('omits unset / empty members (no noise)', () => {
      expect(createFetchQuery<User>().toSpecification()).toStrictEqual({});
      const spec = createFetchQuery<User>().fields().filter({}).toSpecification();
      expect(spec).toStrictEqual({});
    });

    it('carries pagination only when set', () => {
      expect(createFetchQuery<User>().page(2, 50).toSpecification()).toStrictEqual({
        pageNumber: 2,
        pageSize: 50,
      });
      expect(createFetchQuery<User>().pageNumber(3).toSpecification()).toStrictEqual({
        pageNumber: 3,
      });
      expect(createFetchQuery<User>().disablePagination().toSpecification()).toStrictEqual({
        disablePagination: true,
      });
    });
  });

  describe('toSearchParams / toQueryString', () => {
    it('serializes the full wire format', () => {
      const params = createFetchQuery<User>()
        .fields('id', 'name')
        .omitFields('email')
        .include('role', 'role.permissions')
        .filter({ status: 'active', role: ['admin', 'editor'] })
        .search({ name: 'ada' })
        .sort('createdAt', 'DESC')
        .page(1, 25)
        .disablePagination(false)
        .toSearchParams();

      expect(params.get('fields')).toBe('id,name');
      expect(params.get('omitFields')).toBe('email');
      expect(params.get('include')).toBe('role,role.permissions');
      expect(params.get('filter[status]')).toBe('active');
      expect(params.get('filter[role]')).toBe('admin,editor');
      expect(params.get('search[name]')).toBe('ada');
      expect(params.get('sort')).toBe('-createdAt');
      expect(params.get('page[size]')).toBe('25');
      expect(params.get('page[number]')).toBe('1');
      expect(params.get('disablePagination')).toBe('false');
    });

    it('omits params that were never set', () => {
      const params = createFetchQuery<User>().filter({ status: 'active' }).toSearchParams();
      expect(params.has('page[size]')).toBe(false);
      expect(params.has('disablePagination')).toBe(false);
      expect(params.has('sort')).toBe(false);
    });

    it('toQueryString equals toSearchParams().toString()', () => {
      const q = createFetchQuery<User>().filter({ status: 'active' }).sort('name');
      expect(q.toQueryString()).toBe(q.toSearchParams().toString());
    });
  });

  describe('round-trip (serializer <-> parser are exact inverses)', () => {
    it('parseFetchQuery(q.toSearchParams()) deep-equals q.toSpecification()', () => {
      const q = createFetchQuery<User>()
        .fields('id', 'name', 'email')
        .omitFields('status')
        .include('role')
        .filter({ status: 'active', role: ['admin', 'editor'] })
        .search({ name: 'ada' })
        .sort('createdAt', 'DESC')
        .sort('name')
        .page(2, 25)
        .disablePagination(false);

      expect(parseFetchQuery(q.toSearchParams())).toStrictEqual(q.toSpecification());
      expect(parseFetchQuery(q.toQueryString())).toStrictEqual(q.toSpecification());
    });
  });
});

describe('parseFetchQuery', () => {
  it('accepts a string with or without a leading "?"', () => {
    const expected = { filter: { status: ['active'] } };
    expect(parseFetchQuery('filter[status]=active')).toStrictEqual(expected);
    expect(parseFetchQuery('?filter[status]=active')).toStrictEqual(expected);
  });

  it('accepts a URLSearchParams instance', () => {
    const params = new URLSearchParams();
    params.set('search[name]', 'ada');
    expect(parseFetchQuery(params)).toStrictEqual({ search: { name: 'ada' } });
  });

  it('splits list params, keeps sort sigils, and arrays filters', () => {
    const spec = parseFetchQuery(
      'fields=id,name&omitFields=secret&include=a,a.b&sort=-createdAt,name&filter[role]=admin,editor',
    );
    expect(spec).toStrictEqual({
      fields: ['id', 'name'],
      omitFields: ['secret'],
      include: ['a', 'a.b'],
      sort: ['-createdAt', 'name'],
      filter: { role: ['admin', 'editor'] },
    });
  });

  it('parses pagination numbers and the disablePagination boolean', () => {
    expect(parseFetchQuery('page[size]=50&page[number]=2&disablePagination=true')).toStrictEqual({
      pageSize: 50,
      pageNumber: 2,
      disablePagination: true,
    });
    expect(parseFetchQuery('disablePagination=false')).toStrictEqual({ disablePagination: false });
  });

  it('omits absent keys (no empty-array / undefined noise)', () => {
    expect(parseFetchQuery('')).toStrictEqual({});
    expect(parseFetchQuery('fields=')).toStrictEqual({});
  });
});

describe('type-level contract (compile-time)', () => {
  it('accepts known keys and rejects unknown ones', () => {
    const q = createFetchQuery<User>().filter({ name: 'x' }).fields('id', 'name');
    expect(q.toQueryString()).toContain('filter%5Bname%5D=x');

    // @ts-expect-error — `nope` is not a key of User
    createFetchQuery<User>().filter({ nope: 1 });
    // @ts-expect-error — `nope` is not a key of User
    createFetchQuery<User>().fields('nope');
    // @ts-expect-error — `nope` is not a key of User
    createFetchQuery<User>().sort('nope');
  });
});
