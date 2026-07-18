# `@vizzuality/base-service-schema`

Framework-free, [Zod](https://zod.dev)-based runtime for
[`nestjs-base-service`](https://github.com/Vizzuality/nestjs-base-service): the
entity-typed **fetch-query schema builder** plus **JSON:API** error schemas.

Its dependency graph has **zero path** to `@nestjs/*` or `typeorm` — only `zod`
(a peer). It is therefore safe to import from a shared contracts package or a
client bundle, exactly like `@ts-rest/core` is (versus `@ts-rest/nest`). A
leak-guard test enforces this invariant.

| Package                                      | Role                                                                                  | Runtime deps                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------- |
| `@vizzuality/nestjs-base-service-types`      | Pure types (`FetchSpecification`, JSON:API types, `FetchConfig`/`ColumnsOf` generics) | none                             |
| **`@vizzuality/base-service-schema`** (this) | Zod fetch-query builder + JSON:API Zod schemas                                        | `zod` (peer) + the types package |
| `nestjs-base-service`                        | `BaseService`, decorator, `FetchUtils`                                                | `@nestjs/common`, `typeorm`      |

## Install

```bash
pnpm add @vizzuality/base-service-schema zod
```

`zod` is a **peer dependency** so the whole monorepo resolves a single Zod
instance (dual instances break `instanceof` / schema identity).

## Usage

```ts
import { buildFetchQuerySchema } from '@vizzuality/base-service-schema';
import type { Photo } from './photo.entity';

export const photoQuerySchema = buildFetchQuerySchema<Photo>()({
  columnsAllowedAsFilters: ['title', 'id'],
  columnsAllowedAsSearch: ['title'],
  columnsAllowedAsIncludes: ['author'],
  columnsAllowedAsSortable: ['title', 'createdAt', 'updatedAt'],
  columnsAllowedAsFields: ['id', 'title', 'createdAt', 'updatedAt'],
});
```

The schema validates an incoming query and narrows each facet to its allowed
columns. Because the allowed values come from a `const` config, an OpenAPI
document generated from the schema (e.g. via `nestjs-zod`'s `createZodDto`)
documents exactly the permitted columns.

The wire shape is JSON:API-canonical and **tolerant**: `page[number]`/`page[size]`
nested, `filter`/`search` as keyed objects, `sort`/`include`/`fields` as arrays —
but a comma-separated string (`sort=a,-b`) is accepted and split, so it
interoperates with the client query-string builder.

### `disablePagination`

Parsed explicitly: the string `"false"` → `false` and `"true"` → `true` (never
the `z.coerce.boolean()` footgun where `"false"` becomes `true`).

## Contract-first (oRPC / ts-rest)

Because it is framework-free Zod, the schema drops straight into a shared contract
that both your API and client consume. Pair it with `jsonApiErrorDocumentSchema`
for typed errors:

```ts
// oRPC
import { oc } from '@orpc/contract';
import { buildFetchQuerySchema, jsonApiErrorDocumentSchema } from '@vizzuality/base-service-schema';

const baseContract = oc.errors({
  BAD_REQUEST: { status: 400, message: 'Bad Request', data: jsonApiErrorDocumentSchema },
});
export const list = baseContract
  .route({ method: 'GET', path: '/photos', inputStructure: 'detailed' })
  .input(z.object({ query: photoQuerySchema })); // ← the builder's schema
```

```ts
// ts-rest
import { initContract } from '@ts-rest/core';
const c = initContract();
export const photoContract = c.router({
  list: {
    method: 'GET',
    path: '/photos',
    query: photoQuerySchema,
    responses: {
      /* … */
    },
  },
});
```

On the API, turn the schema into a DTO (`createZodDto`) and hand the validated
query to `BaseService.findAllPaginated`. See the main
[README → Contract-first](https://github.com/Vizzuality/nestjs-base-service#contract-first-typed-zod-contracts-with-orpc-or-ts-rest)
for the full server + client walkthrough.

## Client query-string builder

The zero-dependency client builder (`createFetchQuery` / `parseFetchQuery`) is
re-exported here for convenience, and also lives on the types companion's
[`/query`](https://github.com/Vizzuality/nestjs-base-service) subpath for clients
that must not even pull `zod`.
