import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataSource, Repository } from 'typeorm';
import { BaseService } from '../../src/base.service';
import { createPgMemDataSource } from '../utils/pg-mem';
import { Author, Comment, FIXTURE_DDL, Photo } from '../fixtures/entities';

// End-to-end coverage of nested to-one sort / filter / search executed against a
// real (pg-mem) Postgres, so ILIKE, joined ORDER BY and distinct-root pagination
// are all exercised for real.

class CommentService extends BaseService<Comment, Partial<Comment>, Partial<Comment>, unknown> {
  constructor(repository: Repository<Comment>) {
    super(repository, 'comment', { logging: { muteAll: true } });
  }
}

describe('Nested-relation fetch (integration, pg-mem)', () => {
  let dataSource: DataSource;
  let service: CommentService;

  const ids = (comments: Partial<Comment>[]) => comments.map((c) => c.id);

  beforeAll(async () => {
    dataSource = await createPgMemDataSource([Author, Photo, Comment], FIXTURE_DDL);

    const authors = dataSource.getRepository(Author);
    const photos = dataSource.getRepository(Photo);
    const comments = dataSource.getRepository(Comment);

    await authors.save([
      { id: 'a1', name: 'Ada' },
      { id: 'a2', name: 'Bruno' },
    ]);
    await photos.save([
      { id: 'ph1', title: 'Zeta', author: { id: 'a1' } },
      { id: 'ph2', title: 'Alpha', author: { id: 'a2' } },
      { id: 'ph3', title: 'Mango', author: { id: 'a1' } },
    ]);
    await comments.save([
      // `photo_title` scalar is deliberately DIFFERENT from the related photo's
      // title, to expose param-key collisions between `photo.title` and the
      // literal `photo_title` column.
      { id: 'c1', body: 'North', photo: { id: 'ph1' }, photo_title: 'ScalarA' }, // photo Zeta / author Ada
      { id: 'c2', body: 'South', photo: { id: 'ph2' }, photo_title: 'ScalarB' }, // photo Alpha / author Bruno
      { id: 'c3', body: 'East', photo: { id: 'ph3' }, photo_title: 'ScalarC' }, // photo Mango / author Ada
    ]);

    service = new CommentService(comments);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('sorts ascending by a to-one relation column', async () => {
    const [rows] = await service.findAll({ sort: ['photo.title'] });
    // photo titles: Alpha(c2) < Mango(c3) < Zeta(c1)
    expect(ids(rows)).toEqual(['c2', 'c3', 'c1']);
  });

  it('sorts descending by a to-one relation column', async () => {
    const [rows] = await service.findAll({ sort: ['-photo.title'] });
    expect(ids(rows)).toEqual(['c1', 'c3', 'c2']);
  });

  it('sorts by a nested column WITHOUT include, and does not select the relation', async () => {
    // disablePagination avoids TypeORM's distinct-root pagination, which would
    // force the joined sort column into the SELECT; here the relation is joined
    // for ORDER BY only (leftJoin, not leftJoinAndSelect).
    const [rows] = await service.findAll({ sort: ['photo.title'], disablePagination: true });
    expect(ids(rows)).toEqual(['c2', 'c3', 'c1']);
    expect(rows[0].photo).toBeUndefined();
  });

  it('reuses the include join when sorting by the same nested relation (no duplicate-alias error)', async () => {
    const [rows] = await service.findAll({ include: ['photo'], sort: ['photo.title'] });
    expect(ids(rows)).toEqual(['c2', 'c3', 'c1']);
    // include DID select the relation
    expect(rows[0].photo?.title).toBe('Alpha');
  });

  it('filters by a to-one relation column (parameterised)', async () => {
    const [rows, total] = await service.findAll({ filter: { 'photo.title': ['Alpha'] } });
    expect(ids(rows)).toEqual(['c2']);
    expect(total).toBe(1);
  });

  it('searches (ILIKE) by a to-one relation column, case-insensitively', async () => {
    const [rows] = await service.findAll({ search: { 'photo.title': 'MANG' } });
    expect(ids(rows)).toEqual(['c3']);
  });

  it('sorts by a two-level to-one path (a.b.col)', async () => {
    // author: Ada(a1) < Bruno(a2); within Ada, by photo title Mango(c3) < Zeta(c1)
    const [rows] = await service.findAll({
      sort: ['photo.author.name', 'photo.title'],
    });
    expect(ids(rows)).toEqual(['c3', 'c1', 'c2']);
  });

  it('composes a sparse `fields` set with a nested sort (B.1 dependency)', async () => {
    const [rows] = await service.findAll({
      fields: ['body'],
      sort: ['photo.title'],
      disablePagination: true,
    });
    expect(ids(rows)).toEqual(['c2', 'c3', 'c1']);
    // id is forced into a sparse select; the joined relation is not selected
    expect(rows[0].id).toBe('c2');
    expect(rows[0].body).toBe('South');
    expect(rows[0].photo).toBeUndefined();
  });

  it('composes a sparse `fields` set WITH an include — the relation IS returned (B.1)', async () => {
    const [rows] = await service.findAll({
      fields: ['body'],
      include: ['photo'],
      disablePagination: true,
      sort: ['body'],
    });
    const north = rows.find((r) => r.id === 'c1')!;
    // sparse root: id forced in, body present, other root cols absent
    expect(north.id).toBe('c1');
    expect(north.body).toBe('North');
    expect(north.photo_title).toBeUndefined();
    // and the included relation survived the sparse SELECT (the B.1 fix)
    expect(north.photo?.title).toBe('Zeta');
  });

  it('sorts by a nested column WITH pagination (selects the sort column so distinct pagination works)', async () => {
    const [rows, total] = await service.findAll({
      sort: ['photo.title'],
      pageSize: 3,
      pageNumber: 1,
    });
    expect(ids(rows)).toEqual(['c2', 'c3', 'c1']);
    expect(total).toBe(3);
  });

  it('paginates distinct roots in nested-sort order', async () => {
    const [rows, total] = await service.findAll({
      sort: ['photo.title'],
      pageNumber: 1,
      pageSize: 2,
    });
    expect(ids(rows)).toEqual(['c2', 'c3']);
    expect(total).toBe(3);
  });

  it('does not clobber params when a nested path and a literal column collide (filter)', async () => {
    // `photo.title` and the literal `photo_title` column both normalise to the
    // base param `photo_titleValues`. Both clauses must apply independently.
    const [rows] = await service.findAll({
      filter: { 'photo.title': ['Zeta'], photo_title: ['ScalarA'] },
      disablePagination: true,
    });
    expect(ids(rows)).toEqual(['c1']); // photo.title=Zeta AND photo_title=ScalarA

    const [none] = await service.findAll({
      filter: { 'photo.title': ['Zeta'], photo_title: ['ScalarB'] },
      disablePagination: true,
    });
    expect(none).toEqual([]); // c1 has photo.title=Zeta but photo_title=ScalarA, not ScalarB
  });

  it('does not clobber params when a nested path and a literal column collide (search)', async () => {
    const [rows] = await service.findAll({
      search: { 'photo.title': 'zet', photo_title: 'scalara' },
      disablePagination: true,
    });
    expect(ids(rows)).toEqual(['c1']); // photo.title ILIKE %zet% AND photo_title ILIKE %scalara%
  });

  it('rejects a to-many nested path with a clear error', async () => {
    // Author.photos is to-many; sorting through it must throw.
    const authorService = new (class extends BaseService<
      Author,
      Partial<Author>,
      Partial<Author>,
      unknown
    > {
      constructor() {
        super(dataSource.getRepository(Author), 'author', { logging: { muteAll: true } });
      }
    })();
    await expect(authorService.findAll({ sort: ['photos.title'] })).rejects.toThrow(/to-many/);
  });

  it('rejects a bad-grammar path before it reaches SQL', async () => {
    await expect(service.findAll({ sort: ['photo..title'] })).rejects.toThrow(
      /Invalid property path/,
    );
  });
});
