# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

## 1.0.0-rc.5

2026-07-17

Completes Part E: opt-in Zod validation. (The framework-free package split and its
leak-guard landed in `rc.3`.)

### Added

- **`BaseServiceModule.forRoot({ validation })`** — choose the DTO-validation
  strategy per app. `'class-validator'` (default) is a **no-op** over today's
  behaviour; `'zod'` registers the library's `ZodValidationPipe` as a global
  `APP_PIPE`.
- **`ZodValidationPipe`** — a thin, dependency-free pipe that validates any
  Zod-backed DTO (`safeParse` → `400` with the Zod issues on failure) and passes
  non-Zod arguments through. It recognises both the library's `createZodDto` and
  `nestjs-zod`'s (reads their static `schema`), so it needs no `zod` import
  itself.
- **`createZodDto(schema)`** — wrap a Zod schema (e.g. a `buildFetchQuerySchema`
  output) into a DTO the pipe validates, with no extra dependency.
- **`nestjs-zod` optional peer** — if present and you use _its_ `createZodDto`,
  Swagger/OpenAPI is generated from your Zod schema; the library's pipe validates
  those DTOs too. Not required — the built-in path works without it.

### Notes

- `@nestjs/core` is now a peer dependency (for the `APP_PIPE` wiring); every
  NestJS app already provides it.

### Fixed (QA hardening across rc.3–rc.5)

- **Filter/search param-key collision.** A nested path (`photo.title` →
  `photo_title`) and a literal `photo_title` column derived the same bound
  parameter, so one clause silently overwrote the other's value. Param names are
  now made unique per query.
- **`findAllPaginated` + `disablePagination`** now reports honest meta
  (`page: 1`, `size: totalItems`) instead of the default page size while returning
  all rows.
- **`buildPaginationMeta`** coerces a non-positive `pageNumber`/`pageSize` to the
  defaults (no negative `skip`).
- **`BaseServiceModule.forRoot`** throws on an unknown `validation` strategy
  instead of silently wiring nothing.
- **`disablePagination` schema parsing** is now case-insensitive
  (`"TRUE"`/`"False"`), matching the decorator.
- **Invalid `filter`/`search`/`sort` keys** now raise a `400`
  (`BadRequestException`) rather than an unhandled `500`.

### Docs

- Reworked the README with a schema-builder deep-dive and a **contract-first**
  guide (oRPC and ts-rest, server + client). All examples use a generic domain.

## 1.0.0-rc.4

2026-07-17

Adds nested-relation (to-one) sort / filter / search, building on the rc.3 base.

### Added

- **Nested to-one sort / filter / search.** `sort`, `filter` and `search` now
  accept dot-paths into to-one relations (e.g. `sort=author.name`,
  `filter[author.name]=Ansel`, `search[author.name]=ans`, two-level
  `author.studio.name`). A shared resolver (`resolveColumnRef`) walks
  TypeORM relation metadata, joins each segment with the **same alias convention
  as `include`** (`a.b` → `a_b`) so an existing `include` join is reused, and uses
  `leftJoin` (not select) so nested criteria don't hydrate the relation or clash
  with sparse `fields`.
- **`allowedSort`** on the `ProcessFetchSpecification` decorator, mirroring
  `allowedFilters` / `allowedSearch`, to whitelist sortable columns/paths.
- **Bounded-depth nested config types** (`NestedColumnsOf`, `ColumnPathsList`):
  `columnsAllowedAs{Sortable,Filters,Search}` are typed to the entity's to-one
  nested paths (default depth 2), giving autocomplete and compile-time checks.

### Security

- **Closed the raw-sort SQL-injection vector.** Sort paths were previously
  interpolated into ORDER BY unguarded. They are now grammar-checked
  (`^[A-Za-z_][A-Za-z0-9_]*(\.…)*$`) and validated against relation metadata
  before any SQL is built, and gated by `allowedSort` (decorator) /
  `columnsAllowedAsSortable` (Zod schema). Filter/search values remain
  parameterised.

### Notes

- **To-one only (v1).** A path through a to-many relation throws a clear error.
- **Pagination.** Distinct-root pagination (`take`/`skip`) is retained. Sorting by
  a nested column _with pagination_ selects that column (a TypeORM requirement for
  the distinct subquery), so the sorted relation appears partially in results —
  `include` it for full hydration. Non-paginated nested sort leaves the SELECT
  untouched.

## 1.0.0-rc.3

2026-07-17

Absorbs what a downstream integration prototyped and fixes the bugs its
integration tests surfaced. Adds a third, framework-free package and folds the
app-side `ApiBaseService` capabilities into the library.

### Added

- **New package `@vizzuality/base-service-schema`** — a framework-free, Zod-based
  runtime with the entity-typed fetch-query schema builder
  (`buildFetchQuerySchema<Entity>()`) and JSON:API error Zod schemas. Its
  dependency graph has **zero path** to `@nestjs/*` or `typeorm` (only `zod`, a
  peer), enforced by a leak-guard test — so a shared contracts package or a
  client can import it without dragging in NestJS.
- **Folded-in `ApiBaseService` capabilities on `BaseService`**: `findAllPaginated`
  (list → serialize → pagination meta in one call), `toFetchSpecification`
  (nested `page` → flat `pageNumber`/`pageSize`), `buildPaginationMeta` and
  `ensureIdField`. The only app-specific inputs — the JSON:API serializer and the
  resource `type` — are injected via service options, keeping the library
  serializer-agnostic.
- **Pluggable serializer** (`JsonApiSerializerAdapter`): inject any serializer
  (e.g. `ts-japi`) via `serializer.adapter` instead of the built-in, deprecated
  `jsona`. `serialize()` and `findAllPaginated()` both route through it.
- **New generic types** in the types companion: JSON:API document/error shapes
  (`JsonApiResource<TType, TData>`, `JsonApiCollection`, `JsonApiResourceObject`,
  `JsonApiMetaDocument`, `JsonApiPaginationMeta`, error types), the
  `FetchConfig<Entity>` / `ColumnsOf` / `ColumnUnion` generics, and
  `WireFetchQuery`.

### Fixed

- **`fields` + `include` now compose.** A sparse fieldset no longer clobbers an
  included relation's join: `addFields` narrows the root columns while preserving
  joined-relation (and custom `addSelect`) selections.
- **A sparse `fields` set always selects the id column** (using the configured
  `idProperty`), so rows never come back without an id and break JSON:API
  serialization.
- **A single-value filter is no longer a silent no-op.** `?filter[key]=x` (scalar)
  is coerced to a one-element `IN (...)`; blank/`null` values are dropped.
- **`disablePagination` parsing** in the schema builder no longer uses
  `z.coerce.boolean()` (which coerced `"false"` to `true`); `"true"`/`"false"`
  are parsed explicitly.
- **The `ProcessFetchSpecification` decorator now tolerates array wire params**
  (`sort[]=`, `include[]=`, `filter[k][]=`) in addition to comma-separated values,
  so both wire conventions agree.

### Changed

- The loose single-resource type exported from `base.service` was renamed
  `JsonApiResource` → **`JsonApiResourceLike`** to make room for the new generic
  `JsonApiResource<TType, TData>` document type. (The generic types are the
  canonical JSON:API shapes going forward.)

### Docs

- Documented the **query-parser prerequisite** (`app.set('query parser',
'extended')` on Express 5), the **array + CSV wire convention**, the
  **pluggable serializer**, `findAllPaginated`, and the schema package.

## 1.0.0-rc.2

2026-06-26

Second release candidate for the `1.0.0` revival. Purely **additive** on top of
`1.0.0-rc.1` — no breaking changes and no changes to existing behavior: a new
partial-match `search` capability on the fetch specification, and a companion
types package (with an optional, fully-typed query builder) for frontends. The
breaking changes relative to `0.11.0` documented under `1.0.0-rc.1` still apply.

Published under the `rc` dist-tag for integration testing
(`pnpm add nestjs-base-service@rc`); not yet promoted to `latest`.

### Added

- **Partial-match search** on the fetch specification — a new `search` member
  (`PartialMatchSpecification`) alongside `filter`. Each `search[<property>]`
  value is applied as a parameterised, case-insensitive `ILIKE '%term%'` clause
  (vs `filter`'s exact `IN`). Terms are kept as single literal strings (commas
  are not split); multiple search keys are `AND`'d together and with any
  `filter`. The `ProcessFetchSpecification` decorator gains an `allowedSearch`
  whitelist (mirrors `allowedFilters`), and `BaseService.setSearch()` /
  `_processBaseSearchTerm()` are overridable for non-PostgreSQL dialects.
  - The public API is unchanged for existing consumers; `search` is purely
    additive.
- **Types-only companion package `@vizzuality/nestjs-base-service-types`** — a
  zero-runtime, zero-dependency package exposing just the contract types
  (`FetchSpecification` & components, `InfoDTO`,
  `ProcessFetchSpecificationArguments`) so frontends can `import type` them
  without pulling in `@nestjs/common` / `typeorm`. Built from the same
  `src/types/` source as the library (single source of truth) via the new
  `build:types` / `pack:types` scripts. No pnpm workspace.
  - **Query builder (`./query` subpath)** — `createFetchQuery<Entity>()`, an
    immutable, fully-typed builder that composes the exact query string the
    `ProcessFetchSpecification` decorator parses (and `.toSpecification()` for
    the parsed shape), plus its inverse `parseFetchQuery()`. Zero dependencies
    (built-in `URLSearchParams` only); kept in lockstep with the decorator by a
    round-trip test and a contract test against the real decorator. The bare
    types specifier stays runtime-free.

## 1.0.0-rc.1

2026-06-17

First release candidate for the `1.0.0` revival. The package was dormant for ~3
years (NestJS 9 era); this RC brings the toolchain, dependencies and build output
up to date, adds JSON:API serialization, and fixes several latent bugs — while
keeping the public API (`BaseService`, `ProcessFetchSpecification`, `FetchUtils`,
`FetchSpecification`, defaults) and its behavior unchanged.

Published under the `rc` dist-tag for integration testing in downstream projects
(`pnpm add nestjs-base-service@rc`); not yet promoted to `latest`. Expect further
release candidates before the final `1.0.0`.

**Breaking** (relative to `0.11.0`) — drops support for old Node/NestJS/TypeORM
and ships as an ESM + CommonJS dual package. Consumers on NestJS 9/10 should
remain on `0.11.0`.

### Breaking changes

- **Node.js >= 20** required (was `>=14.17`).
- **Peer dependencies bumped:** `@nestjs/common` `^11`, `typeorm` `^0.3.20`
  (was `^9.2.1` / `^0.3.11`).
- **Dual ESM + CJS build** via `tsup`, with an `exports` map and bundled type
  definitions. `main` now points to `./dist/index.cjs`; ESM consumers resolve
  `./dist/index.js`; types resolve per-condition
  (`./dist/index.d.ts` / `./dist/index.d.cts`).
- **Removed unused runtime dependencies:** `express` and `lodash` (the lodash
  helpers used internally were replaced with dependency-free equivalents).
- **`class-validator` / `class-transformer` are now declared as optional peer
  dependencies** instead of bundled runtime deps. They were never imported by
  the library, and class-validator must share a single instance with the host
  app — bundling a copy silently breaks validation.

### Added

- **`async BaseService.serialize(data, meta?, includeNames?)`** — serializes one
  or many entities into a JSON:API document (resource `type`/`id`, attributes,
  relationships and `included`), powered by
  [`jsona`](https://www.npmjs.com/package/jsona). Resource `type` is derived from
  TypeORM entity metadata (falling back to the query alias) and can be overridden
  via the new `serializer.type` service option. (Ticks the long-standing
  "serialization" roadmap item.)
  - **`jsona` is an _optional_ peer dependency**, imported lazily inside
    `serialize()` — projects that do their own serialization need not install it.
    `serialize()` is `async` and throws a clear error if `jsona` is missing.
  - `EntityPropertiesMapper` structurally implements the mapper interface, so the
    package no longer references `jsona` at module-load time, and `jsona` types do
    not leak into the public `.d.ts` (`JsonApiDocument` is self-contained).

### Fixed

- `remove()` / `removeMany()` now honour the configured `idProperty` instead of
  a hardcoded `id` column (deletes were broken for entities with a custom primary
  key).
- `findAllRaw()` now reports the **total** matching row count (via `getCount()`)
  rather than the current page's length.
- Nested `include` aliases beyond two levels are now fully underscored
  (`author.profile.avatar` → `author_profile_avatar`); previously only the first
  dot was replaced.
- `ProcessFetchSpecification` now correctly re-applies the whitelisted filter
  subset (the previous `result.length` check on an object was always falsy).

### Tooling

- Package manager: **pnpm** (was Yarn).
- Build: **tsup** (was `tsc`) — dual ESM+CJS + `.d.ts`, `exports` map, sourcemaps.
- Tests: **Vitest** (was Jest), with `unplugin-swc` so `emitDecoratorMetadata`
  works for NestJS decorators; `BaseService`, `FetchUtils`, the serializer and
  the internal utilities now have test coverage (>90%).
- Lint/format: **oxlint + oxfmt** (was ESLint + Prettier).
- Git hooks: **prek** (a Rust drop-in for pre-commit) via `.pre-commit-config.yaml`,
  running oxlint + oxfmt on staged files (replaces husky + lint-staged).
- TypeScript bumped to `5.9.x`; build target Node 20.
- CI refreshed (pnpm, Node 20/22, updated GitHub Actions).

### Notes

- No breaking changes to the existing public API (`BaseService`,
  `ProcessFetchSpecification`, `FetchUtils`, `FetchSpecification`, defaults) or
  its behavior; `serialize()` is purely additive.

## 0.11.0

2023-03-30

- Make `_processBaseFilter` and `_processBaseFilter` methods of `BaseService` `protected` to allow them to be overriden.

## 0.10.0

2023-01-10

- Update TypeORM version to `v0.3.x`
- Expose logger, so it can be integrated with Nest's logger

## 0.9.0

2022-03-15

This release brings breaking changes to most of the auxiliary methods of
`BaseService`, making them `async` where they were not so already, so that users
of this module can await on async operations at every stage of request
lifecycles handled via BaseService.

Most of these methods should have been `async` all along, similarly to
`extendFindAllQuery()`, in case module users need to perform async operations
throughout any of these lifecycle hooks.

### Changed

- [BREAKING CHANGE] `BaseService.extendGetByIdQuery()` is now `async`
- [BREAKING CHANGE] `BaseService.extendCreateResult()` and
  `BaseService.actionAfterCreate()` are now `async` too; alas
  `actionAfterCreate()` was already `async` but not being `await`ed for
- [BREAKING CHANGE] `BaseService.setFilters()`, `BaseService.setFiltersUpdate()`
  and `BaseService.setFiltersDelete()` are now `async`
- [BREAKING CHANGE] `BaseService.actionAfterUpdate()` is now `async`
- [BREAKING CHANGE] `BaseService.canBeRemoved()` is now `async`

## 0.8.2

2021-11-18

- Move `@nestjs/common` to `peerDependency`

## 0.8.1

2021-11-18

- Update `nodejs` requirement to `>=14.17` instead of `~14.17`

## 0.8.0

2021-11-04

- Bumped `nodejs` requirement to v14.17+
- Updated all dependencies
- Added `typeorm` as a `peerDependency`

## 0.7.1

- Minor improvements to the deployment workflow.
- Remove broken `0.7.0` release.

## 0.7.0

- `FetchSpecificationMiddleware` removed.
  - Equivalent functionality has been moved into the `ProcessFetchSpecification` request parameter decorator.
- `ProcessFetchSpecification` decorator now accepts an optional whitelist of filtering parameters it allows.
- `BaseService` now has a working basic built-in filtering functionality.

## 0.6.1

### Added

- Support for extending result DTO during create and update lifecycles
  ([#12](https://github.com/Vizzuality/nestjs-base-service/issues/12)).

### Fixed

- `extendGetByIdQuery()` was not `await`ed for. This has now been fixed.
- `remove()` was not `await`ed for in `removeMany()`. This has now been fixed.

## 0.6.0

2021-04-30

### Added

- Ability to mute logger fully (e.g. for CI).

### Changed

- [BREAKING CHANGE] `idProperty` is now part of the service `options` provided
  to the constructor.

## 0.5.2

2021-04-20

## Added

- Initial support for `ResultDTO`-like processing: we don't support yet using
  a `ResultDTO` distinct from `Entity` as generic parameters to `BaseService`,
  but if the `Entity` class is set up to include properties that do not map
  directly to database columns it can be used as a sort of DTO, and the hooks
  added in this release allow to reshape/extend data after it has been fetched
  from db.

## [0.5.1]

2021-03-25

### Changed

- `fetchSpecification` is now optional as a parameter to most functions in the
  getAll/getById lifecycles; this is to accommodate uses cases where no fetch
  specification is needed or it cannot be provided for whatever reason.
- Handling of id fields with name other than `id` has been refactored, removing
  the utter nonsense that my own earlier implementation was.

### Removed

- Some verbose logging used during development of the initial FetchSpecification
  implementation has been removed.

## [0.5.0]

2021-03-23

### Added

- Support for processing of meaningful parts of `FetchSpecification` (included
  entities, sparse fieldsets and omitFields) for singular requests.

### Changed

- [BREAKING CHANGE] Signatures of functions related to the `getAll()` and
  `getById()` request lifecycles have been simplified, to avoid duplication and
  inconsistencies.
- [BREAKING CHANGE] `setFiltersGetById()` has been renamed to
  `extendGetByIdQuery()` to clarify that it is not actually meant to set filters
  but to add joins and other conditions to the query being assembled.
- Stricter typing where applicable.

## [0.4.6]

2021-03-22

### Added

- Support for `filter` query params, e.g.
  `filter[keyA]=val1,val2&filter[keyB]=val3,val4,val5`.

## [0.4.5]

2021-03-18

### Added

- Add support for a variant of `findAll()` that returns raw results (to be used
  with a grain of salt and awareness of possible pitfalls).

### Changed

- Refactor parts of `findAll()` now shared with `findAllRaw()`.

## [0.4.4]

2021-03-11

### Fixed

- Remove double processing of sorting configuration. I am pretty sure I had
  actually removed this already, but probably misplaced it in some forgotten
  stash or in a messed-up conflict resolution 🤷.

- Handle bool or bool string for the `disablePagination` value. The type of this
  should be properly enforced one level downstream, but for the moment the
  current guards should be enough.

## [0.4.3]

2021-03-10

### Changed

- Defaults for fetch specification parameters have been cleaned up for
  consistency and by adding typing where missing.

### Fixed

- Handling of included resources is now done through the `include` query param,
  as per JSON:API specification.

- More `"`-wrapping of entity and prop names introduced erroneously in previous
  release was undone. There are no instances left of this bug in the current
  code.

## [0.4.2]

2021-03-04

### Fixed

- Query params processed by `FetchSpecificationMiddleware` should not be left in
  `req.query` - in theory, we should not be fiddling with query params in the
  request object in case these are needed by other middleware, but since this is
  an opinionated package, I think it's ok to do so. This release includes a
  change that does just this - all the query params processed in this middleware
  are deleted from `req.query` at the end of the middleware function, and they
  live on as processed properties of `req.fetchSpecification`.

## [0.4.1]

2021-03-03

### Added

- New fetch specification middleware: reflect fetch specification query
  parameters into the request object, where fetch specification handler code
  expects to find them. This middleware was left to downstream users of this
  module so far, just because there was a single downstream project and we were
  iterating it faster there. After some refactoring, we can now include the
  most recent middleware here.
- Add support for bypassing pagination (`?noPagination=true`).

## [0.4.0]

2021-03-02

### Changed

- [BREAKING CHANGE] `BaseService.findAll()` is now `async` and allows to return
  partial entities in its type signature. This allows to implement features such
  as handling of `omitFields` in classes that inherit from `BaseService`.

## [0.3.0]

2021-03-01

### Added

- Add support for listing fields to be omitted from a response via the
  `omitFields` query param. This is only allowed in terms of configuration, but
  fields listed as `omitFields` are not actually removed from results yet.

### Changed

- [BREAKING CHANGE] Rename `PaginationUtils` to `FetchUtils`.
- [BREAKING CHANGE] Rename `@Pagination()` decorator to
  `@ProcessFetchSpecification()` (this will likely change again in the future:
  the new naming is closer to describing what the decorator is used for, but it
  doesn't align with general naming schemes in NestJS)
- [BREAKING CHANGE] Processing of fetch specifications used to be done via the
  static function `PaginationUtils.pagination()`: this is now done via
  `FetchUtils.processFetchSpecification()`.

## [0.2.2]

2021-02-25

### Added

- Add support for searching by id using arbitrary id column names.

## [0.2.1]

2021-02-08

### Added

- Add initial support for pagination, for plural `GET` requests.
- Add scaffolding for other fetch specification traits: `includes` (resource
  inclusion), `fields` (sparse fieldsets), `sort` (sorting by specific fields).

## [0.2.0]

2021-01-19

### Changed

- [BREAKING CHANGE] `GenericService` has been renamed to `BaseService`, aligning
  the class name to the package name, besides arguably better matching the
  intent of this service.

## [0.1.0]

2021-01-14

Initial release

### Added

- Minimalist base service (`GenericService`).
