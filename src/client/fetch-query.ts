/**
 * Fully-typed, zero-dependency query builder for the `FetchSpecification`
 * contract that `nestjs-base-service`'s `ProcessFetchSpecification` decorator
 * parses from `req.query`.
 *
 * Depends ONLY on the project's own types and the built-in `URLSearchParams`.
 * It does NOT import the decorator, `FetchUtils`, `@nestjs/*` or `typeorm`, so
 * it is safe to ship to a browser / client bundle.
 *
 * The serializer (`toSearchParams` / `toQueryString`) and the parser
 * (`parseFetchQuery`) are exact inverses, and both mirror the decorator's wire
 * format: bracket notation (`filter[k]=`, `search[k]=`, `page[size]=`),
 * comma-joined multi-values and `-`/`+` sort sigils. The repo keeps a
 * round-trip test and a contract test against the real decorator to guard
 * against drift — keep this file and the decorator versioned together.
 *
 * Assumption: the API parses bracket/nested query params (the NestJS / Express
 * default `qs` behaviour). If the host app swaps the query parser, the wire
 * format below must be revisited.
 */
import type { FetchSpecification } from '../types/fetch-specification.interface';

/** A value accepted by `.filter()` for a single key. */
export type FilterValue = string | number | boolean | Array<string | number | boolean>;

interface FetchQueryState {
  fields?: string[];
  omitFields?: string[];
  include?: string[];
  /** Sort entries, sigil-encoded (`key` = ASC, `-key` = DESC). */
  sort?: string[];
  filter?: Record<string, string[]>;
  search?: Record<string, string>;
  pageNumber?: number;
  pageSize?: number;
  disablePagination?: boolean;
}

/**
 * Immutable builder. Every method returns a NEW builder with merged state, so
 * outputs are stable and safe to use as cache keys (e.g. react-query keys).
 */
export interface FetchQuery<Entity, Relations extends string = string> {
  /** Sparse fieldset — only these columns are selected. Replaces any prior set. */
  fields(...keys: (keyof Entity & string)[]): FetchQuery<Entity, Relations>;
  /** Columns to strip from the result objects. Replaces any prior set. */
  omitFields(...keys: (keyof Entity & string)[]): FetchQuery<Entity, Relations>;
  /** Exact-match filters (`key IN (...)`). Merges with previously-set filters. */
  filter(
    filters: Partial<Record<keyof Entity & string, FilterValue>>,
  ): FetchQuery<Entity, Relations>;
  /** Partial-match search terms (`key ILIKE '%term%'`). Merges with prior terms. */
  search(
    terms: Partial<Record<keyof Entity & string, string | number>>,
  ): FetchQuery<Entity, Relations>;
  /** Append a sort column (default `ASC`); call repeatedly for multi-column sort. */
  sort(key: keyof Entity & string, direction?: 'ASC' | 'DESC'): FetchQuery<Entity, Relations>;
  /** Relations to include (`LEFT JOIN`); dot-notation for nested. Replaces prior set. */
  include(...paths: Relations[]): FetchQuery<Entity, Relations>;
  /** Set both page number and (optionally) page size. */
  page(pageNumber: number, pageSize?: number): FetchQuery<Entity, Relations>;
  pageSize(n: number): FetchQuery<Entity, Relations>;
  pageNumber(n: number): FetchQuery<Entity, Relations>;
  /** Disable pagination (default `true`). */
  disablePagination(value?: boolean): FetchQuery<Entity, Relations>;

  /** The parsed `FetchSpecification` object (sort sigils, filter arrays, …). */
  toSpecification(): FetchSpecification;
  /** The wire-format params the decorator parses from `req.query`. */
  toSearchParams(): URLSearchParams;
  /** `toSearchParams().toString()` — no leading `?`. Deterministic. */
  toQueryString(): string;
}

function normalizeFilterValue(value: FilterValue): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values.map((v) => String(v)).filter((s) => s.length > 0);
}

function buildSpecification(state: FetchQueryState): FetchSpecification {
  const spec: FetchSpecification = {};
  if (state.fields?.length) spec.fields = [...state.fields];
  if (state.omitFields?.length) spec.omitFields = [...state.omitFields];
  if (state.include?.length) spec.include = [...state.include];
  if (state.sort?.length) spec.sort = [...state.sort];
  if (state.filter && Object.keys(state.filter).length) {
    spec.filter = Object.fromEntries(Object.entries(state.filter).map(([k, v]) => [k, [...v]]));
  }
  if (state.search && Object.keys(state.search).length) spec.search = { ...state.search };
  if (state.pageNumber !== undefined) spec.pageNumber = state.pageNumber;
  if (state.pageSize !== undefined) spec.pageSize = state.pageSize;
  if (state.disablePagination !== undefined) spec.disablePagination = state.disablePagination;
  return spec;
}

function buildSearchParams(state: FetchQueryState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.fields?.length) params.set('fields', state.fields.join(','));
  if (state.omitFields?.length) params.set('omitFields', state.omitFields.join(','));
  if (state.include?.length) params.set('include', state.include.join(','));
  if (state.sort?.length) params.set('sort', state.sort.join(','));
  if (state.filter) {
    for (const [key, values] of Object.entries(state.filter)) {
      if (values.length) params.set(`filter[${key}]`, values.join(','));
    }
  }
  if (state.search) {
    for (const [key, term] of Object.entries(state.search)) {
      if (term.length) params.set(`search[${key}]`, term);
    }
  }
  if (state.pageSize !== undefined) params.set('page[size]', String(state.pageSize));
  if (state.pageNumber !== undefined) params.set('page[number]', String(state.pageNumber));
  if (state.disablePagination !== undefined) {
    params.set('disablePagination', String(state.disablePagination));
  }
  return params;
}

function createBuilder<Entity, Relations extends string>(
  state: FetchQueryState,
): FetchQuery<Entity, Relations> {
  const next = (patch: Partial<FetchQueryState>) =>
    createBuilder<Entity, Relations>({ ...state, ...patch });

  return {
    fields(...keys) {
      return next({ fields: [...keys] });
    },
    omitFields(...keys) {
      return next({ omitFields: [...keys] });
    },
    filter(filters) {
      const merged: Record<string, string[]> = { ...(state.filter ?? {}) };
      for (const [key, value] of Object.entries(filters)) {
        if (value === undefined) continue;
        const normalized = normalizeFilterValue(value as FilterValue);
        if (normalized.length) merged[key] = normalized;
      }
      return next({ filter: merged });
    },
    search(terms) {
      const merged: Record<string, string> = { ...(state.search ?? {}) };
      for (const [key, value] of Object.entries(terms)) {
        if (value === undefined) continue;
        const term = String(value);
        if (term.length) merged[key] = term;
      }
      return next({ search: merged });
    },
    sort(key, direction = 'ASC') {
      const encoded = direction === 'DESC' ? `-${key}` : key;
      return next({ sort: [...(state.sort ?? []), encoded] });
    },
    include(...paths) {
      return next({ include: [...paths] });
    },
    page(pageNumber, pageSize) {
      return next(pageSize === undefined ? { pageNumber } : { pageNumber, pageSize });
    },
    pageSize(n) {
      return next({ pageSize: n });
    },
    pageNumber(n) {
      return next({ pageNumber: n });
    },
    disablePagination(value = true) {
      return next({ disablePagination: value });
    },
    toSpecification() {
      return buildSpecification(state);
    },
    toSearchParams() {
      return buildSearchParams(state);
    },
    toQueryString() {
      return buildSearchParams(state).toString();
    },
  };
}

/**
 * Create an immutable, fully-typed query builder for `Entity`. Optionally pass a
 * `Relations` string-union for `.include()` autocompletion.
 *
 * @example
 * const q = createFetchQuery<User>()
 *   .filter({ status: 'active' })
 *   .sort('createdAt', 'DESC')
 *   .page(1, 25);
 * fetch(`/api/users?${q.toQueryString()}`);
 */
export function createFetchQuery<Entity, Relations extends string = string>(): FetchQuery<
  Entity,
  Relations
> {
  return createBuilder<Entity, Relations>({});
}

function splitCsv(value: string): string[] {
  return value.split(',').filter((s) => s.length > 0);
}

/**
 * Inverse of `.toSearchParams()` / `.toQueryString()`: reconstruct the
 * `FetchSpecification` the API's decorator would produce from a wire query,
 * without importing the decorator. Useful to re-hydrate builder/filter state
 * from a URL (e.g. `window.location.search`).
 *
 * Accepts a query string (with or without a leading `?`) or a
 * `URLSearchParams`. Absent keys are omitted (no empty-array / undefined noise),
 * mirroring `.toSpecification()` so the two are symmetric.
 */
export function parseFetchQuery<Entity = unknown>(
  input: string | URLSearchParams,
): FetchSpecification {
  const params =
    typeof input === 'string'
      ? new URLSearchParams(input.startsWith('?') ? input.slice(1) : input)
      : input;

  const spec: FetchSpecification = {};

  const fields = params.get('fields');
  if (fields !== null) {
    const arr = splitCsv(fields);
    if (arr.length) spec.fields = arr;
  }
  const omitFields = params.get('omitFields');
  if (omitFields !== null) {
    const arr = splitCsv(omitFields);
    if (arr.length) spec.omitFields = arr;
  }
  const include = params.get('include');
  if (include !== null) {
    const arr = splitCsv(include);
    if (arr.length) spec.include = arr;
  }
  const sort = params.get('sort');
  if (sort !== null) {
    const arr = splitCsv(sort);
    if (arr.length) spec.sort = arr;
  }

  const filter: Record<string, string[]> = {};
  const search: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    const filterMatch = /^filter\[(.+)\]$/.exec(key);
    if (filterMatch) {
      const arr = splitCsv(value);
      if (arr.length) filter[filterMatch[1]] = arr;
      continue;
    }
    const searchMatch = /^search\[(.+)\]$/.exec(key);
    if (searchMatch) {
      if (value.length) search[searchMatch[1]] = value;
    }
  }
  if (Object.keys(filter).length) spec.filter = filter;
  if (Object.keys(search).length) spec.search = search;

  const pageSize = params.get('page[size]');
  if (pageSize !== null) {
    const n = Number.parseInt(pageSize, 10);
    if (Number.isFinite(n) && n > 0) spec.pageSize = n;
  }
  const pageNumber = params.get('page[number]');
  if (pageNumber !== null) {
    const n = Number.parseInt(pageNumber, 10);
    if (Number.isFinite(n) && n > 0) spec.pageNumber = n;
  }

  const disablePagination = params.get('disablePagination');
  if (disablePagination !== null) {
    spec.disablePagination = disablePagination.toLowerCase() === 'true';
  }

  return spec;
}
