import * as httpMock from 'node-mocks-http';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { ProcessFetchSpecification } from '../../src/decorators/process-fetch-specification.decorator';
import { createFetchQuery, parseFetchQuery } from '../../src/client/fetch-query';
import 'reflect-metadata';

// Proves the client helper (`fetch-query.ts`) stays in lockstep with the server
// decorator: the wire params a builder emits, fed through the REAL decorator the
// SAME WAY the app's query parser would, must yield exactly what `parseFetchQuery`
// and `.toSpecification()` produce. If the decorator's parsing ever drifts, this
// test breaks.

function getParamDecoratorFactory() {
  class TestController {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    public handler(@ProcessFetchSpecification() value: unknown) {}
  }
  const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, TestController, 'handler');
  return args[Object.keys(args)[0]].factory;
}

/**
 * Expand flat bracketed params (`filter[status]=active`, `page[size]=25`) into
 * the nested object a `qs`-style query parser (NestJS/Express default) hands to
 * the decorator as `req.query`.
 */
function expandBracketedQuery(params: URLSearchParams): Record<string, unknown> {
  const query: Record<string, unknown> = {};
  for (const [key, value] of params.entries()) {
    const match = /^([^[]+)\[(.+)\]$/.exec(key);
    if (match) {
      const [, outer, inner] = match;
      const bucket = (query[outer] as Record<string, string>) ?? {};
      bucket[inner] = value;
      query[outer] = bucket;
    } else {
      query[key] = value;
    }
  }
  return query;
}

const CANONICAL_KEYS = [
  'fields',
  'omitFields',
  'include',
  'sort',
  'filter',
  'search',
  'pageNumber',
  'pageSize',
  'disablePagination',
] as const;

/**
 * Keep only the canonical `FetchSpecification` keys with defined values. The
 * decorator also leaves a raw `page` object and `undefined` placeholders on its
 * output; those are not part of the contract we compare against.
 */
function canonical(spec: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of CANONICAL_KEYS) {
    if (spec[key] !== undefined) out[key] = spec[key];
  }
  return out;
}

function runRealDecorator(params: URLSearchParams): Record<string, unknown> {
  const req = httpMock.createRequest({
    method: 'GET',
    url: '/get',
    query: expandBracketedQuery(params),
  });
  const res = httpMock.createResponse();
  const factory = getParamDecoratorFactory();
  return factory({}, new ExecutionContextHost([req, res]));
}

describe('fetch-query <-> ProcessFetchSpecification contract', () => {
  it('the decorator reproduces parseFetchQuery() / .toSpecification() from builder wire params', () => {
    const q = createFetchQuery<{
      id: string;
      name: string;
      email: string;
      status: string;
      role: string;
      createdAt: string;
    }>()
      .fields('id', 'name', 'email')
      .omitFields('status')
      .include('role')
      .filter({ status: 'active', role: ['admin', 'editor'] })
      .search({ name: 'ada' })
      .sort('createdAt', 'DESC')
      .sort('name')
      .page(2, 25)
      .disablePagination(false);

    const decoded = canonical(runRealDecorator(q.toSearchParams()));

    expect(decoded).toStrictEqual(q.toSpecification());
    expect(decoded).toStrictEqual(parseFetchQuery(q.toSearchParams()));
  });

  it('agrees with the decorator on a filter/search-only query', () => {
    const q = createFetchQuery<{ status: string; name: string }>()
      .filter({ status: ['a', 'b'] })
      .search({ name: 'jo' });

    const decoded = canonical(runRealDecorator(q.toSearchParams()));
    expect(decoded).toStrictEqual(q.toSpecification());
    expect(decoded).toStrictEqual({ filter: { status: ['a', 'b'] }, search: { name: 'jo' } });
  });
});
