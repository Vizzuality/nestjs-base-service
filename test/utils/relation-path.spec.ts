import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataSource, SelectQueryBuilder } from 'typeorm';
import { resolveColumnRef } from '../../src/utils/relation-path.util';
import { createPgMemDataSource } from '../utils/pg-mem';
import { Author, Comment, FIXTURE_DDL, Photo } from '../fixtures/entities';

// Exercises the resolver against a REAL TypeORM query builder (backed by pg-mem),
// so the metadata walk, alias convention and join type are verified against
// TypeORM's actual internals rather than a hand-mocked shape.

describe('resolveColumnRef', () => {
  let dataSource: DataSource;

  const commentQb = (): SelectQueryBuilder<Comment> =>
    dataSource.getRepository(Comment).createQueryBuilder('comment');
  const aliasNames = (qb: SelectQueryBuilder<unknown>) =>
    qb.expressionMap.aliases.map((a) => a.name);
  const joinAliases = (qb: SelectQueryBuilder<unknown>) =>
    qb.expressionMap.joinAttributes.map((j) => j.alias.name);

  beforeAll(async () => {
    dataSource = await createPgMemDataSource([Author, Photo, Comment], FIXTURE_DDL);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('returns a root column ref without adding any join', () => {
    const qb = commentQb();
    expect(resolveColumnRef(qb, 'comment', 'body')).toBe('comment.body');
    expect(joinAliases(qb)).toEqual([]);
  });

  it('joins a single to-one relation and returns the joined column ref', () => {
    const qb = commentQb();
    expect(resolveColumnRef(qb, 'comment', 'photo.title')).toBe('photo.title');
    expect(joinAliases(qb)).toEqual(['photo']);
  });

  it('uses leftJoin (NOT select) — the relation columns are not added to SELECT', () => {
    const qb = commentQb();
    resolveColumnRef(qb, 'comment', 'photo.title');
    expect(qb.expressionMap.joinAttributes[0].direction).toBe('LEFT');
    expect(qb.expressionMap.selects.some((s) => s.selection === 'photo')).toBe(false);
  });

  it('reuses an alias already created (no duplicate join) when called twice', () => {
    const qb = commentQb();
    resolveColumnRef(qb, 'comment', 'photo.title');
    resolveColumnRef(qb, 'comment', 'photo.id');
    expect(joinAliases(qb)).toEqual(['photo']);
  });

  it('reuses an alias created by include (leftJoinAndSelect) instead of duplicating it', () => {
    const qb = commentQb();
    qb.leftJoinAndSelect('comment.photo', 'photo');
    resolveColumnRef(qb, 'comment', 'photo.title');
    expect(joinAliases(qb)).toEqual(['photo']);
  });

  it('joins a two-level path with the underscore alias convention', () => {
    const qb = commentQb();
    expect(resolveColumnRef(qb, 'comment', 'photo.author.name')).toBe('photo_author.name');
    expect(aliasNames(qb)).toEqual(expect.arrayContaining(['photo', 'photo_author']));
  });

  it('throws on a path through a to-many relation (v1 to-one only)', () => {
    const qb = commentQb();
    expect(() => resolveColumnRef(qb, 'comment', 'photo.comments.body')).toThrow(/to-many/);
  });

  it('throws on an unknown relation', () => {
    const qb = commentQb();
    expect(() => resolveColumnRef(qb, 'comment', 'nope.title')).toThrow(/Unknown relation/);
  });

  it('throws (before touching SQL) on a path with invalid grammar', () => {
    const qb = commentQb();
    expect(() => resolveColumnRef(qb, 'comment', 'body); DROP TABLE comment; --')).toThrow(
      /Invalid property path/,
    );
    expect(() => resolveColumnRef(qb, 'comment', 'photo..title')).toThrow(/Invalid property path/);
    expect(joinAliases(qb)).toEqual([]);
  });
});
