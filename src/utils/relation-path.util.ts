import { SelectQueryBuilder } from 'typeorm';

/**
 * A (possibly nested) property path must be a dot-separated chain of identifiers.
 * Validated BEFORE any SQL is built so a malformed/injected path can never reach
 * the query builder (the relation-metadata lookup below is a second guard).
 */
const PROPERTY_PATH_GRAMMAR = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;

/**
 * Resolve a (possibly nested) property path to a `<alias>.<column>` reference
 * usable in ORDER BY / WHERE, ensuring the relation chain is joined.
 *
 *   'name'          → '<rootAlias>.name'                              (no join)
 *   'project.name'  → leftJoin '<rootAlias>.project' as 'project'    → 'project.name'
 *   'a.b.col'       → leftJoin ... as 'a', then '<a>.b' as 'a_b'     → 'a_b.col'
 *
 * - Aliases follow the `include` convention (`path.replaceAll('.', '_')`), so a
 *   join already created by `FetchUtils.addIncludedEntities` is REUSED, not
 *   duplicated (checked via `query.expressionMap.aliases`).
 * - Uses `leftJoin` (NOT `leftJoinAndSelect`): sorting/filtering must not add the
 *   relation's columns to the SELECT — that is what `include` is for, and
 *   selecting here would collide with a sparse `fields` set.
 * - Only to-one relations (ManyToOne / OneToOne) are traversed; a to-many segment
 *   throws (v1 scope — ambiguous "which of many").
 * - The path grammar is validated first; each segment is then validated against
 *   the entity's relation metadata.
 *
 * Callers MUST still gate the path against the configured allow-list (sortable /
 * filter / search columns) before calling this — the grammar + metadata checks
 * here prevent malformed/unknown paths, but the allow-list is what authorises a
 * path for a given facet.
 */
export function resolveColumnRef<T>(
  query: SelectQueryBuilder<T>,
  rootAlias: string,
  path: string,
): string {
  if (!PROPERTY_PATH_GRAMMAR.test(path)) {
    throw new Error(`Invalid property path '${path}'`);
  }

  const segments = path.split('.');
  const column = segments.pop()!;
  if (segments.length === 0) {
    return `${rootAlias}.${column}`;
  }

  let meta = query.expressionMap.mainAlias!.metadata;
  let parentAlias = rootAlias;
  let builtPath = '';

  for (const relation of segments) {
    const rel = meta.findRelationWithPropertyPath(relation);
    if (!rel) {
      throw new Error(`Unknown relation '${relation}' on '${meta.name}'`);
    }
    if (!(rel.isManyToOne || rel.isOneToOne)) {
      throw new Error(
        `Nested sort/filter/search through to-many relation '${relation}' is not supported`,
      );
    }
    builtPath = builtPath ? `${builtPath}.${relation}` : relation;
    const alias = builtPath.replaceAll('.', '_');
    const alreadyJoined = query.expressionMap.aliases.some((a) => a.name === alias);
    if (!alreadyJoined) {
      query.leftJoin(`${parentAlias}.${relation}`, alias);
    }
    parentAlias = alias;
    meta = rel.inverseEntityMetadata;
  }

  return `${parentAlias}.${column}`;
}
