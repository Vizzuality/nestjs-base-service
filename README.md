# NestJS BaseService

## An opinionated base service for NestJS

Built with :heartpulse: at [Vizzuality](https://vizzuality.com).

`nestjs-base-service` gives your [TypeORM](https://typeorm.io)-backed NestJS
services a batteries-included CRUD layer with a JSON:API-flavoured fetch
specification: pagination, sorting, sparse fieldsets, relation includes and
filtering parsed straight from the request query, plus a set of extension hooks
to customise every step.

It ships as **three coordinated packages** so a browser client can share the
contract without ever importing NestJS:

| Package                                     | Import when you need…                                                           | Runtime deps                                |
| ------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------- |
| **`nestjs-base-service`**                   | the `BaseService`, the decorator, the query engine (server)                     | `@nestjs/common`, `@nestjs/core`, `typeorm` |
| **`@vizzuality/base-service-schema`**       | the Zod **fetch-query schema builder** + JSON:API Zod schemas (shared contract) | `zod` (peer)                                |
| **`@vizzuality/nestjs-base-service-types`** | pure **types** + a zero-dep client **query-string builder**                     | none                                        |

The headline feature is the **fetch-query schema builder**: one entity-typed
config becomes a Zod schema that drives your server-side validation **and** your
[oRPC](https://orpc.unnoq.com/) / [ts-rest](https://ts-rest.com/) contract **and**
your client types — see [Contract-first](#contract-first-typed-zod-contracts-with-orpc-or-ts-rest).

## Table of contents

- [Requirements](#requirements)
- [Install](#install)
- [Usage](#usage)
  - [1. Define a service](#1-define-a-service)
  - [2. Parse the request with `ProcessFetchSpecification`](#2-parse-the-request-with-processfetchspecification)
  - [Query parameter conventions](#query-parameter-conventions)
  - [Nested-relation sort / filter / search](#nested-relation-sort--filter--search-to-one)
  - [Service API](#service-api)
  - [Extension hooks](#extension-hooks)
  - [Service options](#service-options)
  - [JSON:API serialization](#jsonapi-serialization)
  - [Schema-driven listing (`findAllPaginated`)](#schema-driven-listing-findallpaginated)
  - [Validation](#validation)
- [The fetch-query schema builder](#the-fetch-query-schema-builder)
- [Contract-first: typed Zod contracts with oRPC or ts-rest](#contract-first-typed-zod-contracts-with-orpc-or-ts-rest)
- [Packages](#packages)
- [Roadmap](#roadmap)
- [License](#license)

## Requirements

- Node.js >= 20
- `@nestjs/common` >= 11 and `@nestjs/core` >= 11 (peer dependencies)
- `typeorm` >= 0.3.20 (peer dependency)
- `class-validator` / `class-transformer` (optional peers — only if you validate DTOs)
- `jsona` (optional peer — only if you use the built-in `serialize()`)
- `nestjs-zod` (optional peer — only for `validation: 'zod'` with Swagger from your Zod schemas)

The package ships both ESM and CommonJS builds with full type definitions, so it
works in `import` and `require` consumers alike.

## Install

```bash
pnpm add nestjs-base-service
# or: npm install nestjs-base-service / yarn add nestjs-base-service
```

## Usage

### 1. Define a service

Extend `BaseService<Entity, CreateModel, UpdateModel, Info>` and pass the TypeORM
repository, a query alias, and options to `super()`:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseService } from 'nestjs-base-service';

@Injectable()
export class SomeModelsService extends BaseService<
  SomeModel,
  CreateSomeModelDto,
  UpdateSomeModelDto,
  AppInfoDTO
> {
  constructor(@InjectRepository(SomeModel) repository: Repository<SomeModel>) {
    super(repository, 'someModel', { idProperty: 'id' });
  }
}
```

- `Entity` — the TypeORM entity.
- `CreateModel` / `UpdateModel` — the DTOs accepted by `create()` / `update()`.
- `Info` — arbitrary per-request metadata threaded through every method (see
  `InfoDTO`), e.g. the authenticated user.

### 2. Parse the request with `ProcessFetchSpecification`

The `@ProcessFetchSpecification()` parameter decorator turns the request query
into a `FetchSpecification`. Optionally pass `allowedFilters` (exact match) and
`allowedSearch` (partial match) whitelists — keys outside the relevant list then
raise an error.

```typescript
import { FetchSpecification, ProcessFetchSpecification } from 'nestjs-base-service';

@Controller('/api/v1/some-model')
export class SomeModelController {
  constructor(public readonly someModelsService: SomeModelsService) {}

  @Get()
  async findAll(
    @ProcessFetchSpecification({
      allowedFilters: ['status'], // exact-match (`IN`) keys (recommended)
      allowedSearch: ['name'], // partial-match (`ILIKE`) keys
    })
    fetchSpecification: FetchSpecification,
  ) {
    const [data, totalItems] = await this.someModelsService.findAll(fetchSpecification);
    return await this.someModelsService.serialize(data, { totalItems });
  }
}
```

### Query parameter conventions

`ProcessFetchSpecification` reads these query parameters:

| Parameter           | Example                          | Effect                                                          |
| ------------------- | -------------------------------- | --------------------------------------------------------------- |
| `page[number]`      | `?page[number]=2`                | Page number (default `1`).                                      |
| `page[size]`        | `?page[size]=50`                 | Items per page (default `25`).                                  |
| `disablePagination` | `?disablePagination=true`        | Return all matching rows (no `LIMIT`/`OFFSET`).                 |
| `sort`              | `?sort=name,-createdAt`          | Sort columns; prefix `-` for `DESC` (`+`/none = `ASC`).         |
| `fields`            | `?fields=id,name`                | Sparse fieldset — only these columns are `SELECT`ed.            |
| `omitFields`        | `?omitFields=secret`             | Columns stripped from the result objects after querying.        |
| `include`           | `?include=author,author.profile` | `LEFT JOIN` relations (dot-notation for nested).                |
| `filter[key]`       | `?filter[status]=active,pending` | Comma-separated values, applied as `key IN (...)`.              |
| `search[key]`       | `?search[name]=jo`               | Partial, case-insensitive match, applied as `key ILIKE '%jo%'`. |

> `filter` values are parsed into arrays and applied as parameterised `IN`
> clauses (exact match). `search` values are kept as a single literal string —
> commas are **not** split — and applied as parameterised `ILIKE '%term%'`
> clauses (partial, case-insensitive match); multiple `search` keys are AND'd
> together and AND'd with any `filter`. Pass `allowedFilters` / `allowedSearch`
> to the decorator to reject unknown keys.

> **Note:** `ILIKE` is PostgreSQL syntax. On other databases, override
> `BaseService.setSearch()` (or `_processBaseSearchTerm()`) to emit the dialect's
> case-insensitive `LIKE` equivalent.

#### Query-parser prerequisite (required)

Both the decorator and the schema-direct path (below) rely on the host using a
**bracket-expanding query parser**, so that `page[size]`, `filter[status]`,
`search[name]`, etc. arrive as nested objects (`req.query.page.size`,
`req.query.filter.status`) rather than flat string keys. NestJS on Express 4 gave
you this by default; **Express 5 defaults to the flat `simple` parser**, so you
must opt back in:

```typescript
// main.ts — NestExpressApplication
const app = await NestFactory.create<NestExpressApplication>(AppModule);
app.set('query parser', 'extended');
```

Without this, pagination, filtering and search **silently break** (the bracketed
params never expand into objects).

#### Wire convention: arrays _and_ comma-separated values

Multi-value params accept **both** conventions, so the builder, the decorator and
the Zod schema all agree:

- **Bracketed arrays** — `?sort[]=name&sort[]=-createdAt`, `?include[]=author`,
  `?filter[status][]=active&filter[status][]=pending`. This is what the JSON:API
  array style and most typed clients (e.g. oRPC's `OpenAPILink`, serialized by
  `qs`) emit.
- **Comma-separated single values** — `?sort=name,-createdAt`,
  `?include=author`, `?filter[status]=active,pending`. This is what the built-in
  client query-string builder emits.

Either form parses to the same `FetchSpecification`. `search[key]` is always a
single literal (commas are **not** split).

#### Nested-relation sort / filter / search (to-one)

`sort`, `filter` and `search` accept **dot-paths into to-one relations**
(ManyToOne / OneToOne), not just root columns:

```
GET /photos?include=author&sort=author.name       # photos ordered by their author's name
GET /photos?filter[author.name]=Ansel             # only photos whose author is "Ansel"
GET /photos?search[author.name]=ans               # ILIKE on the author's name
GET /photos?sort=author.studio.name               # two-level path
```

- Each path segment is joined with the **same alias convention as `include`**
  (`a.b.c` → alias `a_b_c`), so a join created by `include` is **reused, not
  duplicated**.
- The relation is `LEFT JOIN`ed for the ORDER BY / WHERE only — it is **not**
  added to the SELECT, so nested sort/filter/search do not clash with a sparse
  `fields` set and do not hydrate the relation. **Exception:** sorting by a nested
  column **with pagination** must select that column (a TypeORM requirement for
  distinct-root pagination), so the sorted relation appears partially in results —
  `include` that relation if you need it fully hydrated.
- **To-one only (v1).** A path through a to-many relation
  (OneToMany / ManyToMany) throws a clear error.
- **Security.** Paths are grammar-checked (`^[A-Za-z_][A-Za-z0-9_]*(\.…)*$`) and
  validated against relation metadata before any SQL is built, and values stay
  parameterised. Sorting is otherwise interpolated into ORDER BY, so **whitelist
  sortable paths** with the decorator's `allowedSort` (or the Zod schema's
  `columnsAllowedAsSortable`) — this closes what was previously a raw-sort SQL
  injection vector.

```typescript
@ProcessFetchSpecification({
  allowedFilters: ['status', 'author.name'],
  allowedSearch: ['title', 'author.name'],
  allowedSort: ['title', 'createdAt', 'author.name'], // gates sort paths
})
fetchSpecification: FetchSpecification,
```

With the Zod schema builder, express the same allow-lists (including nested paths)
in the config:

```ts
buildFetchQuerySchema<Photo>()({
  columnsAllowedAsSortable: ['title', 'author.name'],
  columnsAllowedAsFilters: ['author.name'],
  columnsAllowedAsSearch: ['author.name'],
  columnsAllowedAsIncludes: ['author'],
});
```

Nested paths in `sortable` / `filters` / `search` are **typed to bounded-depth
to-one relations** (default 2 levels) of the entity, so you get autocomplete and
a compile error on a wrong path.

### Service API

| Method                                  | Returns                                 | Notes                                                                                                 |
| --------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `findAll(fetchSpec?, info?)`            | `[entities, totalCount]`                | Applies the full fetch specification.                                                                 |
| `findAllRaw(fetchSpec?, info?)`         | `[rawRows, count]`                      | Uses `getRawMany()`; `count` is the total matching rows (via `getCount()`) — see the JSDoc caveats.   |
| `getById(id, fetchSpec?, info?)`        | `entity`                                | Applies `fields`/`omitFields`/`include`; throws `NotFoundException` if absent.                        |
| `create(createModel, info?)`            | `entity`                                | Runs validate + after-create hooks.                                                                   |
| `update(id, updateModel, info?)`        | `entity`                                | Throws `NotFoundException` if absent; runs before/after hooks.                                        |
| `remove(id, info?)`                     | `void`                                  | `NotFoundException` if absent, `ForbiddenException` if `canBeRemoved` is false.                       |
| `removeMany(idList, info?)`             | `void`                                  | Bulk delete by id list.                                                                               |
| `paginate(options)`                     | `Pagination<Entity>`                    | Thin wrapper over [`nestjs-typeorm-paginate`](https://www.npmjs.com/package/nestjs-typeorm-paginate). |
| `findAllPaginated(wireQuery, info?)`    | `Promise<JsonApiCollection & { meta }>` | List → serialize → paginate meta, in one call (see below). Needs a serializer.                        |
| `serialize(data, meta?, includeNames?)` | `Promise<JsonApiDocument>`              | JSON:API serialization (see below). Uses the configured adapter, or the optional `jsona` peer.        |

### Extension hooks

All hooks are `async` and overridable; the base implementations are no-ops (or
return their input). Override only what you need.

- **Query shaping:** `extendFindAllQuery`, `extendGetByIdQuery`, `setFilters`,
  `setSearch`, `setFiltersUpdate`, `setFiltersDelete`
- **Result shaping:** `extendFindAllResults`, `extendGetByIdResult`,
  `extendCreateResult`, `extendUpdateResult`
- **Data mapping:** `setDataCreate`, `setDataUpdate`
- **Validation:** `validateBeforeCreate`, `validateBeforeUpdate`
- **Side effects:** `actionAfterCreate`, `actionBeforeUpdate`, `actionAfterUpdate`
- **Authorization:** `canBeRemoved`

### Service options

```typescript
super(repository, 'someModel', {
  idProperty: 'id', // primary key property name (default: 'id')
  logging: { muteAll: true }, // silence the per-service logger
  serializer: {
    type: 'some-models', // JSON:API resource `type` override
    adapter: myJsonApiSerializer, // pluggable serializer (see below); optional
  },
});
```

### JSON:API serialization

`BaseService.serialize()` turns one or more entities into a JSON:API document.
The resource `type`, `id`, attributes and relationships are derived from the
entity's TypeORM metadata.

It is powered by [`jsona`](https://www.npmjs.com/package/jsona), which is an
**optional peer dependency** loaded lazily — install it only if you use this
method (`pnpm add jsona`). `serialize()` is `async`:

```typescript
// single entity
await service.serialize(entity);

// collection with a top-level meta member
await service.serialize(entities, { totalItems });

// embed related resources in `included` (relation names, dot-notation for nested)
await service.serialize(entity, undefined, ['author', 'author.profile']);
```

The resource `type` defaults to the entity's TypeORM metadata name; override it
with the `serializer.type` service option.

> Already have your own JSON:API serializer? Skip `serialize()` entirely and
> don't install `jsona` — the rest of the library has no dependency on it.

#### Pluggable serializer

`jsona` is the built-in default, but it is deprecated and hardwiring it is not
ideal. To swap in another serializer (e.g. [`ts-japi`](https://www.npmjs.com/package/ts-japi)),
implement `JsonApiSerializerAdapter` and inject it via `serializer.adapter`; the
library then needs neither `jsona` nor any knowledge of the serialization
library:

```typescript
import { JsonApiSerializerAdapter } from 'nestjs-base-service';

// Any object with this shape works — including a NestJS-injected service.
const adapter: JsonApiSerializerAdapter = {
  serialize(type, data, meta) {
    /* return a JSON:API document */
  },
};

super(repository, 'photos', { serializer: { type: 'photos', adapter } });
```

The adapter is called with the resolved resource `type`, the entity/entities and
the optional top-level `meta` — the same signature both `serialize()` and
`findAllPaginated()` route through.

### Schema-driven listing (`findAllPaginated`)

If you validate the incoming query with a Zod DTO instead of the decorator (see
the schema package below), `findAllPaginated()` does list → serialize →
pagination-meta in one call. It accepts the **wire** query shape (nested
`page[number]`/`page[size]`) and normalises it internally (`toFetchSpecification`
maps `page` onto `pageNumber`/`pageSize` and guarantees the id column is present
in any sparse fieldset):

```typescript
@Get()
async list(@Query() query: ListPhotosQueryDto) {
  // -> { data: [...], meta: { totalItems, page, size } }
  return this.photosService.findAllPaginated(query, { authorId: query.authorId });
}
```

It uses the configured serializer (`adapter`, or `jsona`) and the resolved
resource `type`. The pagination `meta` is `{ totalItems, page, size }`.

### Validation

By default, DTO validation is delegated to the host application's
`class-validator` setup (declared as an optional peer dependency — class-validator
must be a single shared instance with your app). Run it inside the
`validateBeforeCreate` / `validateBeforeUpdate` hooks.

#### Opt-in Zod validation

Validation strategy is a per-app choice, wired once at module registration.
`class-validator` stays the default (**no behaviour change** for existing
consumers); Zod is **opt-in**:

```typescript
import { BaseServiceModule } from 'nestjs-base-service';

@Module({
  imports: [
    BaseServiceModule.forRoot({ validation: 'zod' }), // 'class-validator' (default) | 'zod'
  ],
})
export class AppModule {}
```

- `validation: 'class-validator'` (default) → a no-op; nothing new is wired.
- `validation: 'zod'` → registers the library's `ZodValidationPipe` globally
  (via an `APP_PIPE` provider). Any Zod-backed DTO is then validated
  automatically, and a failed parse becomes a `400` carrying the Zod issues.

Build the query DTO from a [`buildFetchQuerySchema`](#schema-package-vizzualitybase-service-schema)
schema:

```typescript
import { createZodDto } from 'nestjs-base-service';
import { photoQuerySchema } from '@myorg/contracts/photo';

// Library helper (no extra deps):
export class ListPhotosQueryDto extends createZodDto(photoQuerySchema) {}
```

`nestjs-zod` is an **optional peer**: if you install it and use _its_
`createZodDto`, the OpenAPI/Swagger document is generated from your Zod schema —
and the library's `ZodValidationPipe` validates those DTOs too (it reads their
static `schema`). Without `nestjs-zod`, the library's `createZodDto` +
`ZodValidationPipe` still validate, just without auto-Swagger.

> **⚠️ Don't run a global class-validator `ValidationPipe` over your Zod DTOs.**
> `ZodValidationPipe` is additive and leaves non-Zod (class-validator) DTOs
> untouched — but the reverse is not safe. A global
> `new ValidationPipe({ whitelist: true })` will strip every property off a
> Zod-backed DTO (it has no `class-validator` decorators), so your handler sees an
> empty query/body. If you opt into `validation: 'zod'`, either drop the global
> class-validator pipe or scope it to the routes that actually use
> class-validator DTOs.

## The fetch-query schema builder

`buildFetchQuerySchema<Entity>()(config)` is the heart of the contract story. You
give it one entity-typed config listing which columns are allowed per facet, and
it returns a **Zod object schema** that:

- validates an incoming query (pagination, sort, filter, search, include, sparse
  fields) and **narrows each facet to its allowed columns**;
- documents the allowed values in its `.describe(...)` text (great for OpenAPI via
  `createZodDto`);
- is **framework-free** — only `zod` — so the same schema is imported by your
  contract, your API and (via `z.infer`) your client.

```ts
import { z } from 'zod';
import { buildFetchQuerySchema } from '@vizzuality/base-service-schema';
import type { Photo } from '@myorg/entities'; // type-only import

export const photoQuerySchema = buildFetchQuerySchema<Photo>()({
  columnsAllowedAsFilters: ['title', 'id'], //                exact IN(...)
  columnsAllowedAsSearch: ['title'], //                       ILIKE '%…%'
  columnsAllowedAsIncludes: ['author'], //                    LEFT JOIN + select
  columnsAllowedAsSortable: ['title', 'createdAt', 'author.name'], // nested ok
  columnsAllowedAsFields: ['id', 'title', 'createdAt'], //    sparse fieldset
});
```

It is curried on purpose: `<Entity>` is an explicit type argument, while the
config is inferred `as const`, so each facet narrows to a literal enum for both
`z.enum` validation and `z.infer`.

### What it emits

The result is a `z.object({ … })` with this shape (every key optional):

| Key                     | Zod shape                                        | Wire                         | Notes                                                                |
| ----------------------- | ------------------------------------------------ | ---------------------------- | -------------------------------------------------------------------- |
| `page`                  | `{ number?: number; size?: number }`             | `page[number]`, `page[size]` | positive ints, coerced from strings                                  |
| `disablePagination`     | `boolean`                                        | `disablePagination=true`     | `"true"`/`"false"` parsed explicitly (no `z.coerce.boolean` footgun) |
| `sort`                  | `enum[]` of `col` and `-col`                     | `sort[]=` or `sort=a,-b`     | includes the descending `-` variants; accepts array **or** CSV       |
| `include`               | `enum[]`                                         | `include[]=` / CSV           | from `columnsAllowedAsIncludes`                                      |
| `fields` / `omitFields` | `enum[]`                                         | `fields[]=` / CSV            | from `columnsAllowedAsFields`                                        |
| `filter`                | `.strict()` object of `col → string \| string[]` | `filter[col][]=`             | unknown keys rejected                                                |
| `search`                | `.strict()` object of `col → string`             | `search[col]=`               | unknown keys rejected                                                |
| _(your `extend`)_       | your extra keys                                  | —                            | merged in (see below)                                                |

A facet you omit from the config becomes `z.undefined()` — that facet is simply
not accepted.

### Compose with `.extend()` and `.pick()`

The output is a plain `ZodObject`, so refine it per route:

```ts
// list: add an app-specific query param
export const listPhotosQuerySchema = photoQuerySchema.extend({
  authorId: z.string().uuid().optional(),
});

// get-one: only the shaping facets, no pagination/sort/filter
export const getPhotoQuerySchema = photoQuerySchema.pick({
  fields: true,
  omitFields: true,
  include: true,
});

// or pass `extend` inline in the config:
buildFetchQuerySchema<Photo>()({
  columnsAllowedAsSortable: ['title'],
  extend: z.object({ authorId: z.string().uuid().optional() }),
});
```

### Derive types

```ts
// the *input* a client sends (strings, pre-coercion)
export type ListPhotosQuery = z.input<typeof listPhotosQuerySchema>;
// the *output* the API receives (coerced + narrowed)
export type ListPhotosQueryParsed = z.infer<typeof listPhotosQuerySchema>;
```

### Nested paths

`columnsAllowedAs{Sortable,Filters,Search}` accept to-one nested paths
(`'author.name'`, bounded to depth 2) and are **typed** to the entity's
relation graph, so you get autocomplete and a compile error on a bad path. See
[Nested-relation sort / filter / search](#nested-relation-sort--filter--search-to-one)
for the runtime behaviour.

## Contract-first: typed Zod contracts with oRPC or ts-rest

Because the schema builder is framework-free Zod, the **same schema** can anchor
an end-to-end typed contract: define it once in a shared `contracts` package, and
both your NestJS API and your browser client consume it — request validation,
response types and typed errors all flowing from one source of truth. This is the
same shape as `@ts-rest/core` (shared) paired with `@ts-rest/nest` (server).

### The layering

```
packages/contracts   ← buildFetchQuerySchema + JSON:API types + the contract
   │   deps: @vizzuality/base-service-schema, @vizzuality/nestjs-base-service-types, zod
   ├── apps/api       ← imports contracts + nestjs-base-service   (server)
   └── apps/web       ← imports contracts only  (no NestJS, no typeorm)
```

A leak-guard test in this repo asserts the schema package never reaches
`@nestjs/*` / `typeorm`, so the `contracts` package stays safe to bundle for the
browser.

### Shared: the query schema + response types

```ts
// packages/contracts/src/photo/fetch.ts
import { z } from 'zod';
import { buildFetchQuerySchema } from '@vizzuality/base-service-schema';
import type { Photo } from '@myorg/entities';

export const photoQuerySchema = buildFetchQuerySchema<Photo>()({
  columnsAllowedAsFilters: ['title', 'id'],
  columnsAllowedAsSearch: ['title'],
  columnsAllowedAsIncludes: ['author'],
  columnsAllowedAsSortable: ['title', 'createdAt', 'author.name'],
  columnsAllowedAsFields: ['id', 'title', 'createdAt'],
});
export const listPhotosQuerySchema = photoQuerySchema.extend({
  authorId: z.string().uuid().optional(),
});
export const getPhotoQuerySchema = photoQuerySchema.pick({
  fields: true,
  omitFields: true,
  include: true,
});
```

```ts
// packages/contracts/src/json-api.ts — shared JSON:API response shapes (types)
import type {
  JsonApiResource,
  JsonApiCollection,
  JsonApiPaginationMeta,
} from '@vizzuality/nestjs-base-service-types';
import type { Photo } from '@myorg/entities';

export type PhotoResource = JsonApiResource<'photo', Photo>;
export type PhotoCollection = JsonApiCollection<'photo', Photo> & {
  meta: JsonApiPaginationMeta;
};
```

### With oRPC

Wire typed JSON:API errors once on a base contract using the error Zod schema,
then feed `listPhotosQuerySchema` straight into `.input()`:

```ts
// packages/contracts/src/base.contract.ts
import { oc } from '@orpc/contract';
import { jsonApiErrorDocumentSchema } from '@vizzuality/base-service-schema';

export const baseContract = oc.errors({
  BAD_REQUEST: { status: 400, message: 'Bad Request', data: jsonApiErrorDocumentSchema },
  UNAUTHORIZED: { status: 401, message: 'Unauthorized', data: jsonApiErrorDocumentSchema },
  NOT_FOUND: { status: 404, message: 'Not Found', data: jsonApiErrorDocumentSchema },
});
```

```ts
// packages/contracts/src/photo/contract.ts
import { z } from 'zod';
import { type } from '@orpc/contract';
import { baseContract } from '../base.contract.js';
import { listPhotosQuerySchema, getPhotoQuerySchema } from './fetch.js';
import type { PhotoResource, PhotoCollection } from '../json-api.js';

export const photoContract = {
  list: baseContract
    .route({ method: 'GET', path: '/photos', inputStructure: 'detailed' })
    .input(z.object({ query: listPhotosQuerySchema })) // ← the builder's schema
    .output(type<PhotoCollection>()),
  get: baseContract
    .route({ method: 'GET', path: '/photos/{id}', inputStructure: 'detailed' })
    .input(z.object({ params: z.object({ id: z.string().uuid() }), query: getPhotoQuerySchema }))
    .output(type<PhotoResource>()),
};
```

**Server** (NestJS, via `@orpc/nest`). Turn the schema into a DTO, and let
`findAllPaginated` return the exact `PhotoCollection & { meta }` the contract
promises:

```ts
// photos.dto.ts
import { createZodDto } from 'nestjs-zod'; // or from 'nestjs-base-service'
import { listPhotosQuerySchema } from '@myorg/contracts/photo';
export class ListPhotosQueryDto extends createZodDto(listPhotosQuerySchema) {}
```

```ts
// photos.controller.ts
@Implement(contract.photos.list)
list(@Query() query: ListPhotosQueryDto) {
  return implement(contract.photos.list).handler(() =>
    this.service.findAllPaginated(query, { authorId: query.authorId }),
  );
}
```

**Client** — fully typed, no NestJS in the bundle:

```ts
import { createORPCClient } from '@orpc/client';
import { OpenAPILink } from '@orpc/openapi-client';
import type { ContractRouterClient } from '@orpc/contract';
import { contract } from '@myorg/contracts';

const link = new OpenAPILink(contract, { url: 'https://api.example.com/v1' });
const client: ContractRouterClient<typeof contract> = createORPCClient(link);

const photos = await client.photos.list({
  query: { sort: ['-createdAt'], filter: { title: 'Sunset' }, page: { size: 25 } },
});
// photos.data → typed JSON:API resources; photos.meta → { totalItems, page, size }
```

### With ts-rest

The same schema drops into a `@ts-rest/core` router as the `query`:

```ts
// packages/contracts/src/photo.contract.ts
import { initContract } from '@ts-rest/core';
import { jsonApiErrorDocumentSchema } from '@vizzuality/base-service-schema';
import { listPhotosQuerySchema, getPhotoQuerySchema } from './photo/fetch';
import type { PhotoResource, PhotoCollection } from './json-api';

const c = initContract();
export const photoContract = c.router({
  list: {
    method: 'GET',
    path: '/photos',
    query: listPhotosQuerySchema, // ← the builder's schema
    responses: {
      200: c.type<PhotoCollection>(),
      400: jsonApiErrorDocumentSchema,
    },
  },
  get: {
    method: 'GET',
    path: '/photos/:id',
    query: getPhotoQuerySchema,
    responses: { 200: c.type<PhotoResource>(), 404: jsonApiErrorDocumentSchema },
  },
});
```

**Server** (`@ts-rest/nest`):

```ts
@TsRestHandler(photoContract.list)
async list() {
  return tsRestHandler(photoContract.list, async ({ query }) => ({
    status: 200,
    body: await this.service.findAllPaginated(query),
  }));
}
```

**Client**:

```ts
import { initClient } from '@ts-rest/core';
import { photoContract } from '@myorg/contracts';

const client = initClient(photoContract, { baseUrl: 'https://api.example.com/v1' });
const res = await client.list({ query: { sort: ['-createdAt'], page: { size: 25 } } });
if (res.status === 200) res.body.data; // typed JSON:API collection
```

### Two things to get right

1. **Query parser (server).** oRPC's `OpenAPILink` and ts-rest serialize array
   query params in bracket form (`sort[]=`, `filter[title][]=`), so the API **must**
   use the bracket-expanding parser — see
   [the prerequisite](#query-parser-prerequisite-required). The builder tolerates
   both arrays and CSV, but the host has to expand the brackets into objects first.
2. **The schema is the whitelist.** With a contract, the Zod schema _is_ the
   allow-list (`z.enum` per facet, `.strict()` objects), so you don't also need the
   decorator's `allowedSort` / `allowedFilters`: unknown columns are rejected at
   the contract boundary with a typed `400`. (Use the decorator instead when you
   are _not_ going contract-first.)

## Packages

The three packages are built from one `src/` tree, so the types a client compiles
against can never drift from the server.

| Package                                 | Contents                                                      | Runtime deps                                | Typical install                    |
| --------------------------------------- | ------------------------------------------------------------- | ------------------------------------------- | ---------------------------------- |
| `nestjs-base-service`                   | `BaseService`, decorator, `FetchUtils`, resolver, module/pipe | `@nestjs/common`, `@nestjs/core`, `typeorm` | `dependency` (API)                 |
| `@vizzuality/base-service-schema`       | `buildFetchQuerySchema`, JSON:API error Zod schemas           | `zod` (peer)                                | `dependency` (contracts)           |
| `@vizzuality/nestjs-base-service-types` | pure types + client query-string builder (`/query`)           | none                                        | `devDependency` (client/contracts) |

### `@vizzuality/nestjs-base-service-types`

Pure contract **types** (`FetchSpecification`, the JSON:API document types,
`FetchConfig` / `ColumnsOf` generics, `WireFetchQuery`, `InfoDTO`) — zero runtime,
so a client can `import type` them without dragging in `@nestjs/common` /
`typeorm`.

```ts
import type { FetchSpecification, JsonApiCollection } from '@vizzuality/nestjs-base-service-types';
```

It also exposes a zero-dependency, fully-typed **client query-string builder** on
the `./query` subpath — the mirror image of `buildFetchQuerySchema` (one _emits_ a
query string, the other _validates_ one):

```ts
import { createFetchQuery } from '@vizzuality/nestjs-base-service-types/query';

const qs = createFetchQuery<User>()
  .filter({ status: 'active' })
  .search({ name: 'ada' })
  .sort('createdAt', 'DESC')
  .page(1, 25)
  .toQueryString(); // -> `fetch('/api/users?' + qs)`
```

### `@vizzuality/base-service-schema`

The framework-free Zod runtime: `buildFetchQuerySchema` and the JSON:API error
schemas, with **zero path** to `@nestjs/*` or `typeorm` (only `zod`, a peer) — a
leak-guard test enforces that boundary. `zod` is a peer so the whole monorepo
resolves a single instance. The client builder above is also re-exported here for
convenience. See [`packages/schema/README.md`](./packages/schema/README.md).

### Build & pack

```bash
pnpm build:all     # builds all three (dist/ + packages/*/dist)
pnpm pack          # -> nestjs-base-service-<version>.tgz
pnpm pack:types    # -> packages/types/vizzuality-nestjs-base-service-types-<version>.tgz
pnpm pack:schema   # -> packages/schema/vizzuality-base-service-schema-<version>.tgz
```

## Roadmap

- [x] Add tests
- [x] Add support for pagination
- [x] Add support for serialization (pluggable serializer)
- [x] Add support for validation (opt-in Zod via `forRoot`)
- [x] Nested to-one sort / filter / search
- [x] Framework-free Zod schema builder for contract-first APIs
- [ ] Nested to-many sort / filter / search (`EXISTS` / `MIN` / `MAX`)
- [ ] Sparse fields on relations (`fields[relation]=…`)
- [ ] Add tutorial
- [ ] Implement transaction support
- [ ] Add support for auditing (via plugin?)

## License

(C) Copyright [Vizzuality](https://vizzuality.com) 2020-2026.

Distributed under the [MIT](LICENSE) license.
