# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic
Versioning](https://semver.org/spec/v2.0.0.html).


## [0.4.1]

Unreleased

### Added

- New fetch specification middleware: reflect fetch specification query
  parameters into the request object, where fetch specification handler code
  expects to find them. This middleware was left to downstream users of this
  module so far, just because there was a single downstream project and we were
  iterating it faster there. After some refactoring, we can now include the
  most recent middleware here.
- Add support for bypassing pagination (`?noPagination=true`).

### Changed

### Deprecated

### Removed

### Fixed


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
