import * as httpMock from 'node-mocks-http';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import {
  ProcessFetchSpecification,
  ProcessFetchSpecificationArguments,
} from '../../src/decorators/process-fetch-specification.decorator';
import 'reflect-metadata';

describe('Test ProcessFetchSpecification decorator', () => {
  function getParamDecoratorFactory() {
    class TestController {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      public testHTTPMethodImplementation(@ProcessFetchSpecification() value) {}
    }

    const args = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      TestController,
      'testHTTPMethodImplementation',
    );
    return args[Object.keys(args)[0]].factory;
  }

  it('When no request filters are provided, the request no filter values', () => {
    const req = httpMock.createRequest({
      method: 'GET',
      url: '/get',
    });
    const res = httpMock.createResponse();
    const mockDecoratorData = new ExecutionContextHost([req, res]);
    const factory = getParamDecoratorFactory();
    const processFetchSpecificationResultArguments: ProcessFetchSpecificationArguments = {};
    const processFetchSpecificationResult = factory(
      processFetchSpecificationResultArguments,
      mockDecoratorData,
    );
    expect(processFetchSpecificationResult.filter).toStrictEqual(undefined);
  });

  it('When no request filters are provided but the configuration has filter values, the request no filter values', () => {
    const req = httpMock.createRequest({
      method: 'GET',
      url: '/get',
    });
    const res = httpMock.createResponse();
    const mockDecoratorData = new ExecutionContextHost([req, res]);
    const factory = getParamDecoratorFactory();
    const processFetchSpecificationResultArguments: ProcessFetchSpecificationArguments = {
      allowedFilters: ['foo'],
    };
    const processFetchSpecificationResult = factory(
      processFetchSpecificationResultArguments,
      mockDecoratorData,
    );
    expect(processFetchSpecificationResult.filter).toStrictEqual(undefined);
  });

  it('When request filters match the configuration, the request has the provided filter values', () => {
    const req = httpMock.createRequest({
      method: 'GET',
      url: '/get',
      query: {
        filter: {
          foo: 'bar',
        },
      },
    });
    const res = httpMock.createResponse();
    const mockDecoratorData = new ExecutionContextHost([req, res]);
    const factory = getParamDecoratorFactory();
    const processFetchSpecificationResultArguments: ProcessFetchSpecificationArguments = {
      allowedFilters: ['foo'],
    };
    const processFetchSpecificationResult = factory(
      processFetchSpecificationResultArguments,
      mockDecoratorData,
    );
    expect(processFetchSpecificationResult.filter).toStrictEqual({ foo: ['bar'] });
  });

  it('When request filters are not present in the configuration, the request has the provided filter values', () => {
    const req = httpMock.createRequest({
      method: 'GET',
      url: '/get',
      query: {
        filter: {
          foo: 'bar',
        },
      },
    });
    const res = httpMock.createResponse();
    const mockDecoratorData = new ExecutionContextHost([req, res]);
    const factory = getParamDecoratorFactory();
    const processFetchSpecificationResultArguments: ProcessFetchSpecificationArguments = {
      allowedFilters: ['goo'],
    };
    expect(() => factory(processFetchSpecificationResultArguments, mockDecoratorData)).toThrowError(
      `Invalid filter key: foo`,
    );
  });

  // Convenience runner: build a request with the given query and return the
  // parsed fetch specification (and the request, to assert query cleanup).
  function run(query: Record<string, unknown>, args: ProcessFetchSpecificationArguments = {}) {
    const req = httpMock.createRequest({ method: 'GET', url: '/get', query });
    const res = httpMock.createResponse();
    const factory = getParamDecoratorFactory();
    const result = factory(args, new ExecutionContextHost([req, res]));
    return { result, req };
  }

  describe('pagination parsing', () => {
    it('parses page[size] and page[number]', () => {
      const { result } = run({ page: { size: '10', number: '3' } });
      expect(result.pageSize).toBe(10);
      expect(result.pageNumber).toBe(3);
    });

    it('discards zero/negative page values as undefined', () => {
      const { result } = run({ page: { size: '0', number: '-2' } });
      expect(result.pageSize).toBeUndefined();
      expect(result.pageNumber).toBeUndefined();
    });

    it('parses disablePagination from the string "true"', () => {
      expect(run({ disablePagination: 'true' }).result.disablePagination).toBe(true);
      expect(run({ disablePagination: 'TRUE' }).result.disablePagination).toBe(true);
      expect(run({ disablePagination: 'false' }).result.disablePagination).toBe(false);
    });

    it('parses disablePagination from a boolean', () => {
      expect(run({ disablePagination: true }).result.disablePagination).toBe(true);
    });

    it('leaves disablePagination undefined when absent', () => {
      expect(run({}).result.disablePagination).toBeUndefined();
    });
  });

  describe('list parsing (comma-separated)', () => {
    it('splits fields, omitFields, include and sort on commas', () => {
      const { result } = run({
        fields: 'id,name',
        omitFields: 'secret',
        include: 'author,author.profile',
        sort: '-createdAt,name',
      });
      expect(result.fields).toStrictEqual(['id', 'name']);
      expect(result.omitFields).toStrictEqual(['secret']);
      expect(result.include).toStrictEqual(['author', 'author.profile']);
      expect(result.sort).toStrictEqual(['-createdAt', 'name']);
    });

    it('parses filter values into arrays, dropping empty entries', () => {
      const { result } = run({ filter: { status: 'active,pending', tag: 'a,,b' } });
      expect(result.filter).toStrictEqual({ status: ['active', 'pending'], tag: ['a', 'b'] });
    });
  });

  it('removes consumed params from the request query (so ValidationPipe whitelisting is happy)', () => {
    const { req } = run({
      fields: 'id',
      omitFields: 'secret',
      page: { size: '10' },
      sort: 'name',
      include: 'author',
      disablePagination: 'true',
    });
    for (const key of ['fields', 'omitFields', 'page', 'sort', 'include', 'disablePagination']) {
      expect(req.query).not.toHaveProperty(key);
    }
  });

  it('keeps a whitelisted subset of filters when allowedFilters is provided', () => {
    const { result } = run({ filter: { foo: 'bar' } }, { allowedFilters: ['foo'] });
    expect(result.filter).toStrictEqual({ foo: ['bar'] });
  });

  describe('search parsing (partial match)', () => {
    it('leaves search undefined when no search params are provided', () => {
      expect(run({}).result.search).toBeUndefined();
    });

    it('keeps each search term as a single literal string (no comma splitting)', () => {
      const { result } = run({ search: { name: 'jo', city: 'new,york' } });
      expect(result.search).toStrictEqual({ name: 'jo', city: 'new,york' });
    });

    it('drops empty search terms so we never emit ILIKE %%', () => {
      const { result } = run({ search: { name: '', city: 'lon' } });
      expect(result.search).toStrictEqual({ city: 'lon' });
    });

    it('removes the consumed search param from the request query', () => {
      const { req } = run({ search: { name: 'jo' } });
      expect(req.query).not.toHaveProperty('search');
    });

    it('keeps a whitelisted subset of search keys when allowedSearch is provided', () => {
      const { result } = run({ search: { name: 'jo' } }, { allowedSearch: ['name'] });
      expect(result.search).toStrictEqual({ name: 'jo' });
    });

    it('throws on a search key that is not in allowedSearch', () => {
      expect(() => run({ search: { secret: 'x' } }, { allowedSearch: ['name'] })).toThrowError(
        'Invalid search key: secret',
      );
    });
  });

  describe('sort whitelisting (allowedSort)', () => {
    it('keeps sort entries that are in allowedSort (sigils stripped before check)', () => {
      const { result } = run({ sort: 'name,-createdAt' }, { allowedSort: ['name', 'createdAt'] });
      expect(result.sort).toStrictEqual(['name', '-createdAt']);
    });

    it('accepts a nested to-one sort path when whitelisted', () => {
      const { result } = run({ sort: ['project.name'] }, { allowedSort: ['project.name'] });
      expect(result.sort).toStrictEqual(['project.name']);
    });

    it('throws on a sort key outside allowedSort (closing the raw-sort injection vector)', () => {
      expect(() => run({ sort: 'name,bad' }, { allowedSort: ['name'] })).toThrowError(
        'Invalid sort key: bad',
      );
    });

    it('does not gate sort when allowedSort is not provided', () => {
      const { result } = run({ sort: 'anything' });
      expect(result.sort).toStrictEqual(['anything']);
    });
  });
});
