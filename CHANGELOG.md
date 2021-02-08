# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic
Versioning](https://semver.org/spec/v2.0.0.html).


## [0.2.2]

WIP

### Added

### Changed

### Fixed

### Deprecated

### Removed


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
