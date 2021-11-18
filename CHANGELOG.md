# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## 0.8.1

2021-11-18

- Update `nodejs` requirement to `>14.17` instead of `~14.17`

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
