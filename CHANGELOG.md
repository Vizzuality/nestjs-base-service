# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 1.0.0

2026-06-09

Modernization release. **Breaking** — drops support for old Node/NestJS and ships
as an ESM + CommonJS dual package.

### Breaking changes

- **Node.js >= 20** required (was `>=14.17`).
- **Peer dependencies bumped:** `@nestjs/common` `^11`, `typeorm` `^0.3.20`
  (was `^9.2.1` / `^0.3.11`).
- **Dual ESM + CJS build** via `tsup`, with an `exports` map. `main` now points
  to `./dist/index.cjs`; ESM consumers resolve `./dist/index.js`.
- **Removed unused runtime dependencies:** `express` and `lodash` (the lodash
  helpers used internally were replaced with dependency-free equivalents).
- **`class-validator` / `class-transformer` are now declared as optional peer
  dependencies** instead of bundled runtime deps. They were never imported by
  the library, and class-validator must share a single instance with the host
  app — bundling a copy silently breaks validation.

### Added

- **`async BaseService.serialize(data, meta?, includeNames?)`** — serializes
  entities into a JSON:API document (resource `type`/`id`, attributes,
  relationships and `included`), powered by
  [`jsona`](https://www.npmjs.com/package/jsona). Resource `type` is derived from
  TypeORM entity metadata and can be overridden via the new `serializer.type`
  service option. (Ticks the long-standing "serialization" roadmap item.)
  - **`jsona` is an _optional_ peer dependency**, imported lazily inside
    `serialize()` — projects that do their own serialization need not install it.
    `serialize()` is `async` and throws a clear error if `jsona` is missing.

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
- Tests: **Vitest** (was Jest); `BaseService`, `FetchUtils`, the serializer and
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
