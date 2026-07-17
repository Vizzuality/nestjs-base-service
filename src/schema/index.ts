/**
 * `@vizzuality/base-service-schema` — the framework-free, Zod-based runtime for
 * `nestjs-base-service`.
 *
 * Contents:
 * - `buildFetchQuerySchema` — the entity-typed fetch-query validator (server-side).
 * - JSON:API error Zod schemas.
 * - the client query-string builder (`createFetchQuery` / `parseFetchQuery`),
 *   re-exported from the zero-dependency client module so a consumer of this
 *   package has both the validator and the builder in one place.
 *
 * Dependency graph: only `zod` (a peer) + the types companion package. No path
 * to `@nestjs/*` or `typeorm` — safe to import from a client bundle. A leak-guard
 * test asserts this (see `test/schema/leak-guard.spec.ts`).
 */
export { buildFetchQuerySchema, type ZodFetchConfig } from './fetch-schema';
export { jsonApiErrorObjectSchema, jsonApiErrorDocumentSchema } from './json-api.schema';

// The client query-string builder is genuinely zero-dependency (it imports only
// a type). It is ALSO published on the types companion's `/query` subpath for
// clients that must not even pull `zod`; re-exported here for convenience.
export {
  createFetchQuery,
  parseFetchQuery,
  type FetchQuery,
  type FilterValue,
} from '../client/fetch-query';

// Re-export the pure generics the builder is configured with, so a consumer can
// type a `FetchConfig` from this single package.
export type { ColumnsOf, ColumnUnion, FetchConfig } from '../types/fetch-config';
