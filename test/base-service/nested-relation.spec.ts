import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataSource, Repository } from 'typeorm';
import { BaseService } from '../../src/base.service';
import { createPgMemDataSource } from '../utils/pg-mem';
import { Farm, FIXTURE_DDL, Organisation, Project } from '../fixtures/entities';

// End-to-end coverage of Part D: nested to-one sort / filter / search executed
// against a real (pg-mem) Postgres, so ILIKE, joined ORDER BY and distinct-root
// pagination are all exercised for real.

class FarmService extends BaseService<Farm, Partial<Farm>, Partial<Farm>, unknown> {
  constructor(repository: Repository<Farm>) {
    super(repository, 'farm', { logging: { muteAll: true } });
  }
}

describe('Nested-relation fetch (integration, pg-mem)', () => {
  let dataSource: DataSource;
  let service: FarmService;

  const ids = (farms: Partial<Farm>[]) => farms.map((f) => f.id);

  beforeAll(async () => {
    dataSource = await createPgMemDataSource([Farm, Project, Organisation], FIXTURE_DDL);

    const orgs = dataSource.getRepository(Organisation);
    const projects = dataSource.getRepository(Project);
    const farms = dataSource.getRepository(Farm);

    await orgs.save([
      { id: 'o1', name: 'Acorn' },
      { id: 'o2', name: 'Beta Org' },
    ]);
    await projects.save([
      { id: 'p1', name: 'Zeta', organisation: { id: 'o1' } },
      { id: 'p2', name: 'Alpha', organisation: { id: 'o2' } },
      { id: 'p3', name: 'Mango', organisation: { id: 'o1' } },
    ]);
    await farms.save([
      { id: 'f1', name: 'North', project: { id: 'p1' } }, // project Zeta / org Acorn
      { id: 'f2', name: 'South', project: { id: 'p2' } }, // project Alpha / org Beta Org
      { id: 'f3', name: 'East', project: { id: 'p3' } }, // project Mango / org Acorn
    ]);

    service = new FarmService(farms);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('sorts ascending by a to-one relation column', async () => {
    const [rows] = await service.findAll({ sort: ['project.name'] });
    // project names: Alpha(f2) < Mango(f3) < Zeta(f1)
    expect(ids(rows)).toEqual(['f2', 'f3', 'f1']);
  });

  it('sorts descending by a to-one relation column', async () => {
    const [rows] = await service.findAll({ sort: ['-project.name'] });
    expect(ids(rows)).toEqual(['f1', 'f3', 'f2']);
  });

  it('sorts by a nested column WITHOUT include, and does not select the relation', async () => {
    // disablePagination avoids TypeORM's distinct-root pagination, which would
    // force the joined sort column into the SELECT; here the relation is joined
    // for ORDER BY only (leftJoin, not leftJoinAndSelect).
    const [rows] = await service.findAll({ sort: ['project.name'], disablePagination: true });
    expect(ids(rows)).toEqual(['f2', 'f3', 'f1']);
    expect(rows[0].project).toBeUndefined();
  });

  it('reuses the include join when sorting by the same nested relation (no duplicate-alias error)', async () => {
    const [rows] = await service.findAll({ include: ['project'], sort: ['project.name'] });
    expect(ids(rows)).toEqual(['f2', 'f3', 'f1']);
    // include DID select the relation
    expect(rows[0].project?.name).toBe('Alpha');
  });

  it('filters by a to-one relation column (parameterised)', async () => {
    const [rows, total] = await service.findAll({ filter: { 'project.name': ['Alpha'] } });
    expect(ids(rows)).toEqual(['f2']);
    expect(total).toBe(1);
  });

  it('searches (ILIKE) by a to-one relation column, case-insensitively', async () => {
    const [rows] = await service.findAll({ search: { 'project.name': 'MANG' } });
    expect(ids(rows)).toEqual(['f3']);
  });

  it('sorts by a two-level to-one path (a.b.col)', async () => {
    // org: Acorn(o1) < Beta Org(o2); within Acorn, by project name Mango(f3) < Zeta(f1)
    const [rows] = await service.findAll({
      sort: ['project.organisation.name', 'project.name'],
    });
    expect(ids(rows)).toEqual(['f3', 'f1', 'f2']);
  });

  it('composes a sparse `fields` set with a nested sort (B.1 dependency)', async () => {
    const [rows] = await service.findAll({
      fields: ['name'],
      sort: ['project.name'],
      disablePagination: true,
    });
    expect(ids(rows)).toEqual(['f2', 'f3', 'f1']);
    // id is forced into a sparse select; the joined relation is not selected
    expect(rows[0].id).toBe('f2');
    expect(rows[0].name).toBe('South');
    expect(rows[0].project).toBeUndefined();
  });

  it('sorts by a nested column WITH pagination (selects the sort column so distinct pagination works)', async () => {
    const [rows, total] = await service.findAll({
      sort: ['project.name'],
      pageSize: 3,
      pageNumber: 1,
    });
    expect(ids(rows)).toEqual(['f2', 'f3', 'f1']);
    expect(total).toBe(3);
  });

  it('paginates distinct roots in nested-sort order', async () => {
    const [rows, total] = await service.findAll({
      sort: ['project.name'],
      pageNumber: 1,
      pageSize: 2,
    });
    expect(ids(rows)).toEqual(['f2', 'f3']);
    expect(total).toBe(3);
  });

  it('rejects a to-many nested path with a clear error', async () => {
    // Organisation.projects is to-many; sorting through it must throw.
    const orgService = new (class extends BaseService<
      Organisation,
      Partial<Organisation>,
      Partial<Organisation>,
      unknown
    > {
      constructor() {
        super(dataSource.getRepository(Organisation), 'organisation', {
          logging: { muteAll: true },
        });
      }
    })();
    await expect(orgService.findAll({ sort: ['projects.name'] })).rejects.toThrow(/to-many/);
  });

  it('rejects a bad-grammar path before it reaches SQL', async () => {
    await expect(service.findAll({ sort: ['project..name'] })).rejects.toThrow(
      /Invalid property path/,
    );
  });
});
