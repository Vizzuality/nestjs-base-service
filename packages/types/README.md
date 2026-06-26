# `@vizzuality/nestjs-base-service-types`

Type-only contract for [`nestjs-base-service`](https://github.com/Vizzuality/nestjs-base-service),
plus an optional, fully-typed query builder.

Zero runtime, zero dependencies — no `@nestjs/*`, no `typeorm`. Built from the
same source as the main library, so the types a frontend compiles against can
never drift from the API. The package has two entry points:

| Import specifier                              | Contents                                           | Runtime         |
| --------------------------------------------- | -------------------------------------------------- | --------------- |
| `@vizzuality/nestjs-base-service-types`       | The contract **types** only                        | None (erased)   |
| `@vizzuality/nestjs-base-service-types/query` | `createFetchQuery()` builder + `parseFetchQuery()` | Tiny, deps-free |

## Install

```bash
# types only (compile-time): install as a devDependency
pnpm add -D @vizzuality/nestjs-base-service-types

# if you also use the runtime query builder from `/query`,
# install it as a regular dependency instead:
pnpm add @vizzuality/nestjs-base-service-types
```

> npm / yarn equivalents: `npm i -D …` / `yarn add -D …`. For local testing
> against a packed tarball, point the spec at the `.tgz`:
> `pnpm add -D ../nestjs-base-service/packages/types/vizzuality-nestjs-base-service-types-<version>.tgz`.

The bare specifier is **types only** — install it as a `devDependency`, as these
are compile-time-only types fully erased from your bundle. The `/query` subpath
carries a small runtime (the builder + parser); if you import it, install the
package as a regular `dependency`.

## Usage

```ts
import type {
  FetchSpecification,
  PaginationSpecification,
  FieldsAndIncludesSpecification,
  SortSpecification,
  FiltersSpecification,
  PartialMatchSpecification,
  InfoDTO,
  ProcessFetchSpecificationArguments,
} from '@vizzuality/nestjs-base-service-types';

// e.g. typing the query a frontend sends to the API, end-to-end:
const spec: FetchSpecification = {
  pageSize: 25,
  sort: ['-createdAt'],
  filter: { status: ['active'] },
  search: { name: 'jo' },
};
```

Use `import type` so the import is fully erased at build time.

## Query builder (`./query`)

`createFetchQuery<Entity>()` is an immutable, fully-typed builder that composes
the exact query string the API's `ProcessFetchSpecification` decorator parses —
so you compose filters/sorting/pagination once, type-checked against your
entity, and emit either the wire query string or the parsed `FetchSpecification`.

```ts
import { createFetchQuery, parseFetchQuery } from '@vizzuality/nestjs-base-service-types/query';

interface User {
  id: string;
  name: string;
  email: string;
  status: string;
  role: string;
  createdAt: string;
}

const q = createFetchQuery<User>()
  .filter({ status: 'active', role: ['admin', 'editor'] }) // exact match (IN)
  .search({ name: 'ada' }) // partial match (ILIKE)
  .sort('createdAt', 'DESC') // call again to add more sort columns
  .fields('id', 'name', 'email')
  .page(1, 25);

// 1) As a URL query string — deterministic, so it doubles as a cache key:
fetch(`/api/users?${q.toQueryString()}`);

// 2) As the parsed FetchSpecification — e.g. for an oRPC / structured input:
//    client.users.list({ fetchSpecification: q.toSpecification() });

// Inverse: re-hydrate a FetchSpecification from a URL (e.g. shareable filters):
const fromUrl = parseFetchQuery(window.location.search);
```

Builder methods are typed off `keyof Entity`, so `q.filter({ unknown: 1 })` is a
compile-time error. Every method returns a **new** builder (state is never
mutated), making outputs safe to use as cache keys (e.g. react-query keys).

`createFetchQuery<Entity, Relations>()` accepts an optional second
string-union type parameter to type `.include()` against known relation paths.

### Notes

- The builder is a typing/ergonomics aid, **not** a runtime validator.
- It assumes the API parses bracket/nested query params (`filter[key]=`,
  `page[size]=`) — the NestJS / Express default (`qs`). If your app swaps the
  query parser, verify the wire format still matches.
- `toSearchParams()` / `toQueryString()` and `parseFetchQuery()` are exact
  inverses, both kept in lockstep with the server decorator by tests in the
  library repo.
