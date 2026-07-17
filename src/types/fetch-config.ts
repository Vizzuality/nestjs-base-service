/**
 * Pure, framework-free generics describing which of an entity's columns are
 * allowed as each fetch facet (filters, search, includes, sortable, fields).
 *
 * These carry ZERO runtime and ZERO dependencies (no `zod`, no `typeorm`), so
 * they live in the types-only companion package. The Zod schema builder in
 * `@vizzuality/base-service-schema` consumes them and adds a runtime `extend`
 * facet on top (which is why the `extend` key is NOT modelled here — it would
 * drag `zod` into this package).
 */

/** A readonly list of an entity's own string-keyed columns. */
export type ColumnsOf<Entity> = readonly (keyof Entity & string)[];

/** Element type of a (possibly absent) column list, as a string-literal union. */
export type ColumnUnion<List> = List extends readonly (infer Column)[] ? Column & string : never;

/** A leaf (scalar) column value — everything that is NOT a relation to traverse. */
type ScalarColumn = string | number | boolean | bigint | symbol | Date | null | undefined;

/** Keys of `Entity` whose value is a scalar (leaf) column. */
type ScalarKeys<Entity> = {
  [K in keyof Entity]-?: NonNullable<Entity[K]> extends ScalarColumn ? K & string : never;
}[keyof Entity];

/**
 * Keys of `Entity` whose value is a to-one relation: an object that is neither a
 * scalar nor an array (a to-many relation is excluded — Part D v1 traverses
 * to-one relations only).
 */
type ToOneRelationKeys<Entity> = {
  [K in keyof Entity]-?: NonNullable<Entity[K]> extends ScalarColumn
    ? never
    : NonNullable<Entity[K]> extends readonly unknown[]
      ? never
      : K & string;
}[keyof Entity];

// Decrementing depth counter (index → index-1); `PrevDepth[0]` is `never`, which
// terminates the recursion.
type PrevDepth = [never, 0, 1, 2, 3];

/**
 * Dot-paths into `Entity`'s to-one relations, bounded to `Depth` levels (default
 * 2). Descends ONLY into relation (object) properties; each leaf is a scalar
 * column of the related entity.
 *
 * The depth bound is essential: entities have circular relations (e.g.
 * `Photo.author` ↔ `Author.photos`), so an unbounded nested-key type would
 * recurse forever and blow up `tsc`. The `Depth extends 0 → never` base case and
 * the decrementing `PrevDepth` counter cap the descent.
 */
export type NestedColumnsOf<Entity, Depth extends number = 2> = Depth extends 0
  ? never
  : {
      [K in ToOneRelationKeys<Entity>]:
        | `${K}.${ScalarKeys<NonNullable<Entity[K]>>}`
        | `${K}.${NestedColumnsOf<NonNullable<Entity[K]>, PrevDepth[Depth]>}`;
    }[ToOneRelationKeys<Entity>];

/** An entity's own scalar columns plus its bounded-depth to-one nested paths. */
export type ColumnPathsOf<Entity, Depth extends number = 2> =
  | (keyof Entity & string)
  | NestedColumnsOf<Entity, Depth>;

/** A readonly list of column paths (root columns or to-one nested paths). */
export type ColumnPathsList<Entity> = readonly ColumnPathsOf<Entity>[];

/**
 * The per-facet allow-lists for an entity's fetch query. Each is optional; a
 * facet with no list allows nothing for that facet (the schema builder emits
 * `z.undefined()` for it).
 *
 * `sortable`, `filters` and `search` accept **nested to-one paths** (e.g.
 * `'photo.title'`, `'photo.author.name'`) in addition to the entity's
 * own columns — see `NestedColumnsOf`. `includes` and `fields` stay root-only:
 * includes already nest at runtime via their own dot-paths, and sparse fields on
 * a relation is a separate, out-of-scope feature.
 */
export interface FetchConfig<Entity> {
  columnsAllowedAsFilters?: ColumnPathsList<Entity>;
  columnsAllowedAsSearch?: ColumnPathsList<Entity>;
  columnsAllowedAsIncludes?: ColumnsOf<Entity>;
  columnsAllowedAsSortable?: ColumnPathsList<Entity>;
  columnsAllowedAsFields?: ColumnsOf<Entity>;
}
