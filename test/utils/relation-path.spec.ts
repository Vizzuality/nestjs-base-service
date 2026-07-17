import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataSource, SelectQueryBuilder } from 'typeorm';
import { resolveColumnRef } from '../../src/utils/relation-path.util';
import { createPgMemDataSource } from '../utils/pg-mem';
import { Farm, FIXTURE_DDL, Organisation, Project } from '../fixtures/entities';

// Exercises the resolver against a REAL TypeORM query builder (backed by pg-mem),
// so the metadata walk, alias convention and join type are verified against
// TypeORM's actual internals rather than a hand-mocked shape.

describe('resolveColumnRef', () => {
  let dataSource: DataSource;

  const farmQb = (): SelectQueryBuilder<Farm> =>
    dataSource.getRepository(Farm).createQueryBuilder('farm');
  const aliasNames = (qb: SelectQueryBuilder<unknown>) =>
    qb.expressionMap.aliases.map((a) => a.name);
  const joinAliases = (qb: SelectQueryBuilder<unknown>) =>
    qb.expressionMap.joinAttributes.map((j) => j.alias.name);

  beforeAll(async () => {
    dataSource = await createPgMemDataSource([Farm, Project, Organisation], FIXTURE_DDL);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('returns a root column ref without adding any join', () => {
    const qb = farmQb();
    expect(resolveColumnRef(qb, 'farm', 'name')).toBe('farm.name');
    expect(joinAliases(qb)).toEqual([]);
  });

  it('joins a single to-one relation and returns the joined column ref', () => {
    const qb = farmQb();
    expect(resolveColumnRef(qb, 'farm', 'project.name')).toBe('project.name');
    expect(joinAliases(qb)).toEqual(['project']);
  });

  it('uses leftJoin (NOT select) — the relation columns are not added to SELECT', () => {
    const qb = farmQb();
    resolveColumnRef(qb, 'farm', 'project.name');
    expect(qb.expressionMap.joinAttributes[0].direction).toBe('LEFT');
    expect(qb.expressionMap.selects.some((s) => s.selection === 'project')).toBe(false);
  });

  it('reuses an alias already created (no duplicate join) when called twice', () => {
    const qb = farmQb();
    resolveColumnRef(qb, 'farm', 'project.name');
    resolveColumnRef(qb, 'farm', 'project.id');
    expect(joinAliases(qb)).toEqual(['project']);
  });

  it('reuses an alias created by include (leftJoinAndSelect) instead of duplicating it', () => {
    const qb = farmQb();
    qb.leftJoinAndSelect('farm.project', 'project');
    resolveColumnRef(qb, 'farm', 'project.name');
    expect(joinAliases(qb)).toEqual(['project']);
  });

  it('joins a two-level path with the underscore alias convention', () => {
    const qb = farmQb();
    expect(resolveColumnRef(qb, 'farm', 'project.organisation.name')).toBe(
      'project_organisation.name',
    );
    expect(aliasNames(qb)).toEqual(expect.arrayContaining(['project', 'project_organisation']));
  });

  it('throws on a path through a to-many relation (v1 to-one only)', () => {
    const qb = farmQb();
    expect(() => resolveColumnRef(qb, 'farm', 'project.farms.name')).toThrow(/to-many/);
  });

  it('throws on an unknown relation', () => {
    const qb = farmQb();
    expect(() => resolveColumnRef(qb, 'farm', 'nope.name')).toThrow(/Unknown relation/);
  });

  it('throws (before touching SQL) on a path with invalid grammar', () => {
    const qb = farmQb();
    expect(() => resolveColumnRef(qb, 'farm', 'name); DROP TABLE farm; --')).toThrow(
      /Invalid property path/,
    );
    expect(() => resolveColumnRef(qb, 'farm', 'project..name')).toThrow(/Invalid property path/);
    expect(joinAliases(qb)).toEqual([]);
  });
});
