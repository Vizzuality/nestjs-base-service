import { z } from 'zod';

import type { ColumnUnion, FetchConfig } from '../types/fetch-config';

/**
 * Entity-typed fetch-query schema builder.
 *
 * `buildFetchQuerySchema<Entity>()(config)` returns a Zod object that validates
 * an incoming fetch query (pagination, sort, filter, search, include, sparse
 * fields) against the columns each facet allows. Because the allowed columns
 * come from a `const` config, the schema (and any OpenAPI generated from it, e.g.
 * via `nestjs-zod`'s `createZodDto`) documents exactly the permitted values, and
 * `z.infer` narrows each facet to its allowed enum.
 *
 * This module is framework-free: its only runtime dependency is `zod` (a peer),
 * plus the pure generics from the types companion package. It has NO path to
 * `@nestjs/*` or `typeorm`, so it is safe to import from a client bundle.
 *
 * Wire shape is JSON:API-canonical and tolerant: nested `page`, `filter`/`search`
 * as keyed objects, and `sort`/`include`/`fields` as arrays — but a
 * comma-separated string (`sort=a,-b`) is also accepted and split, so it
 * interoperates with the client query-string builder in the types companion.
 */

type Tuple<T extends string> = [T, ...T[]];

/**
 * Config accepted by the builder: the pure per-facet allow-lists (from the types
 * package) plus an optional Zod `extend` object merged into the resulting schema
 * (e.g. an app-specific `authorId`). `extend` is modelled here rather than
 * in the types package so `zod` never leaks into the zero-dependency types
 * companion.
 */
export type ZodFetchConfig<Entity> = FetchConfig<Entity> & {
  extend?: z.AnyZodObject;
};

const quoteColumns = (columns: readonly string[]): string =>
  columns.map((column) => `\`${column}\``).join(', ');

// A bracket-array query parser (Express `qs`) yields an array for `prop[]=a` or
// `prop=a,b`; a bare `prop=a,b` yields a string we split here. Either way the
// facet ends up an array before enum validation.
const csvToArray = (value: unknown): unknown =>
  typeof value === 'string'
    ? value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : value;

/**
 * Parse a boolean flag from the wire WITHOUT `z.coerce.boolean()`, which coerces
 * ANY non-empty string (including `"false"`) to `true`. We map the two JSON:API
 * string literals explicitly and pass booleans through; anything else is left
 * for `z.boolean()` to reject.
 */
const booleanFlag = z.preprocess((value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    // Case-insensitive, so `?disablePagination=TRUE` agrees with the decorator's
    // `.toLowerCase() === 'true'` parsing. Anything else falls through to
    // `z.boolean()` and is rejected.
    const normalized = value.toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return value;
}, z.boolean());

// Per-facet descriptions; the allowed columns come from the config so the schema
// (and Swagger, via createZodDto) documents the permitted columns.
function includeDescription(columns: readonly string[]): string {
  const base =
    'A comma-separated list of relationship paths. Allows the client to customize which related resources should be returned.';
  return columns.length ? `${base} Allowed values are: ${quoteColumns(columns)}.` : base;
}

function filterDescription(columns: readonly string[]): string {
  const base =
    'An array of filters (e.g. `filter[keyA]=<value>&filter[keyB]=<value1>,<value2>...`). Allows the client to request for specific filtering criteria to be applied to the request.';
  return columns.length ? `${base} Available filters: ${quoteColumns(columns)}.` : base;
}

function searchDescription(columns: readonly string[]): string {
  const base =
    "A set of partial, case-insensitive matches (e.g. `search[keyA]=term`). Each term is matched as a substring (`ILIKE '%term%'`); multiple keys are combined with `AND` and with any `filter`.";
  return columns.length ? `${base} Available search keys: ${quoteColumns(columns)}.` : base;
}

function sortDescription(columns: readonly string[]): string {
  const base =
    'A comma-separated list of fields according to which the results should be sorted. Sort order is ascending unless the field name is prefixed with a minus (for descending order).';
  return columns.length ? `${base} Allowed values are: ${quoteColumns(columns)}.` : base;
}

function fieldsDescription(columns: readonly string[]): string {
  const base =
    'A comma-separated list that refers to the name(s) of the fields to be returned. An empty value indicates that all fields will be returned (less any fields specified as `omitFields`).';
  return columns.length ? `${base} Allowed values are: ${quoteColumns(columns)}.` : base;
}

function omitFieldsDescription(columns: readonly string[]): string {
  const base =
    'A comma-separated list that refers to the name(s) of fields to be omitted from the results.';
  return columns.length ? `${base} Allowed values are: ${quoteColumns(columns)}.` : base;
}

const PAGE_DESCRIPTION =
  'Pagination controls. Use `page[size]` and `page[number]` (JSON:API style).';
const PAGE_SIZE_DESCRIPTION =
  'Page size for pagination. If not supplied, a default page size will be applied.';
const PAGE_NUMBER_DESCRIPTION =
  'Page number for pagination. If not supplied, the first page of results will be returned.';
const DISABLE_PAGINATION_DESCRIPTION =
  'If set to `true`, pagination will be disabled. This overrides any other pagination query parameters, if supplied.';

// Curried so `Entity` is explicit (type-only) while the config is inferred as a
// `const`, narrowing each facet to its allowed columns for both z.enum and
// z.infer.
export function buildFetchQuerySchema<Entity>() {
  return function <const Config extends ZodFetchConfig<Entity>>(config: Config) {
    const sortable = config.columnsAllowedAsSortable ?? [];
    const sortValues = [
      ...sortable,
      ...sortable.map(
        (column) => `-${column}` as `-${ColumnUnion<Config['columnsAllowedAsSortable']>}`,
      ),
    ];

    const include = config.columnsAllowedAsIncludes?.length
      ? z.preprocess(
          csvToArray,
          z.array(
            z.enum(
              config.columnsAllowedAsIncludes as Tuple<
                ColumnUnion<Config['columnsAllowedAsIncludes']>
              >,
            ),
          ),
        )
      : z.undefined();

    const sort = sortValues.length
      ? z.preprocess(
          csvToArray,
          z.array(
            z.enum(
              sortValues as Tuple<
                | ColumnUnion<Config['columnsAllowedAsSortable']>
                | `-${ColumnUnion<Config['columnsAllowedAsSortable']>}`
              >,
            ),
          ),
        )
      : z.undefined();

    // Built as fixed-shape objects (not `z.record(z.enum(...), …)`) so the
    // allowed keys land in the generated OpenAPI schema as explicit
    // `properties`; a record key-enum only survives in the description.
    // `.strict()` keeps the record's reject-unknown-keys behaviour.
    const filterValueSchema = z.union([z.string(), z.array(z.string())]);
    const filter = config.columnsAllowedAsFilters?.length
      ? z
          .object(
            Object.fromEntries(
              config.columnsAllowedAsFilters.map((column) => [
                column,
                filterValueSchema.optional(),
              ]),
            ) as Record<
              ColumnUnion<Config['columnsAllowedAsFilters']>,
              z.ZodOptional<typeof filterValueSchema>
            >,
          )
          .strict()
      : z.undefined();

    const search = config.columnsAllowedAsSearch?.length
      ? z
          .object(
            Object.fromEntries(
              config.columnsAllowedAsSearch.map((column) => [column, z.string().optional()]),
            ) as Record<ColumnUnion<Config['columnsAllowedAsSearch']>, z.ZodOptional<z.ZodString>>,
          )
          .strict()
      : z.undefined();

    // `z.undefined()` fallback (not `z.string()`) keeps the inferred element a
    // narrowed enum rather than widening to string.
    const fieldColumns = config.columnsAllowedAsFields?.length
      ? z.preprocess(
          csvToArray,
          z.array(
            z.enum(
              config.columnsAllowedAsFields as Tuple<ColumnUnion<Config['columnsAllowedAsFields']>>,
            ),
          ),
        )
      : z.undefined();

    const base = z.object({
      page: z
        .object({
          number: z.coerce.number().int().positive().optional().describe(PAGE_NUMBER_DESCRIPTION),
          size: z.coerce.number().int().positive().optional().describe(PAGE_SIZE_DESCRIPTION),
        })
        .optional()
        .describe(PAGE_DESCRIPTION),
      disablePagination: booleanFlag.optional().describe(DISABLE_PAGINATION_DESCRIPTION),
      fields: fieldColumns
        .optional()
        .describe(fieldsDescription(config.columnsAllowedAsFields ?? [])),
      omitFields: fieldColumns
        .optional()
        .describe(omitFieldsDescription(config.columnsAllowedAsFields ?? [])),
      include: include
        .optional()
        .describe(includeDescription(config.columnsAllowedAsIncludes ?? [])),
      sort: sort.optional().describe(sortDescription(config.columnsAllowedAsSortable ?? [])),
      filter: filter.optional().describe(filterDescription(config.columnsAllowedAsFilters ?? [])),
      search: search.optional().describe(searchDescription(config.columnsAllowedAsSearch ?? [])),
    });

    const extension = config.extend ?? z.object({});
    return base.extend(
      extension.shape as Config extends {
        extend: z.ZodObject<infer Shape extends z.ZodRawShape>;
      }
        ? Shape
        : Record<never, never>,
    );
  };
}
