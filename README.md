# NestJS BaseService

## An opinionated base service for NestJS

Built with :heartpulse: at [Vizzuality](https://vizzuality.com).

`nestjs-base-service` gives your [TypeORM](https://typeorm.io)-backed NestJS
services a batteries-included CRUD layer with a JSON:API-flavoured fetch
specification: pagination, sorting, sparse fieldsets, relation includes and
filtering parsed straight from the request query, plus a set of extension hooks
to customise every step.

## Requirements

- Node.js >= 20
- `@nestjs/common` >= 11 (peer dependency)
- `typeorm` >= 0.3.20 (peer dependency)
- `class-validator` / `class-transformer` (optional peers — only if you validate DTOs)
- `jsona` (optional peer — only if you use `serialize()`)

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

### Service API

| Method                                  | Returns                    | Notes                                                                                                 |
| --------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------- |
| `findAll(fetchSpec?, info?)`            | `[entities, totalCount]`   | Applies the full fetch specification.                                                                 |
| `findAllRaw(fetchSpec?, info?)`         | `[rawRows, count]`         | Uses `getRawMany()`; `count` is the total matching rows (via `getCount()`) — see the JSDoc caveats.   |
| `getById(id, fetchSpec?, info?)`        | `entity`                   | Applies `fields`/`omitFields`/`include`; throws `NotFoundException` if absent.                        |
| `create(createModel, info?)`            | `entity`                   | Runs validate + after-create hooks.                                                                   |
| `update(id, updateModel, info?)`        | `entity`                   | Throws `NotFoundException` if absent; runs before/after hooks.                                        |
| `remove(id, info?)`                     | `void`                     | `NotFoundException` if absent, `ForbiddenException` if `canBeRemoved` is false.                       |
| `removeMany(idList, info?)`             | `void`                     | Bulk delete by id list.                                                                               |
| `paginate(options)`                     | `Pagination<Entity>`       | Thin wrapper over [`nestjs-typeorm-paginate`](https://www.npmjs.com/package/nestjs-typeorm-paginate). |
| `serialize(data, meta?, includeNames?)` | `Promise<JsonApiDocument>` | JSON:API serialization (see below). Requires the optional `jsona` peer dep.                           |

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
  serializer: { type: 'some-models' }, // JSON:API resource `type` override
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

### Validation

DTO validation is delegated to the host application's `class-validator` setup
(declared as an optional peer dependency — class-validator must be a single
shared instance with your app). Run it inside the `validateBeforeCreate` /
`validateBeforeUpdate` hooks.

## Types-only companion package

A frontend app (or a shared package) that only needs the contract types —
`FetchSpecification` and its component interfaces, `InfoDTO`,
`ProcessFetchSpecificationArguments` — should **not** install this library and
drag in `@nestjs/common` / `typeorm`. For that, there is a zero-runtime
companion package, **`@vizzuality/nestjs-base-service-types`**, built from the
same `src/types/` source so the types can never drift from the API.

```ts
import type {
  FetchSpecification,
  InfoDTO,
  ProcessFetchSpecificationArguments,
} from '@vizzuality/nestjs-base-service-types';
```

Install it as a **devDependency** (the types are erased at build time, adding
nothing to your bundle). Build and pack it from this repo:

```bash
pnpm build:types   # emits packages/types/dist
pnpm pack:types    # -> packages/types/vizzuality-nestjs-base-service-types-<version>.tgz
```

See [`packages/types/README.md`](./packages/types/README.md) for the full usage
and install details.

## Roadmap

- [x] Add tests
- [x] Add support for pagination
- [x] Add support for serialization
- [ ] Add tutorial
- [ ] Implement transaction support
- [ ] Implement opinionated batching
- [ ] Add support for validation (via plugin?)
- [ ] Add support for auditing (via plugin?)
- [ ] Add support for batching of operations

## License

(C) Copyright [Vizzuality](https://vizzuality.com) 2020-2026.

Distributed under the [MIT](LICENSE) license.
