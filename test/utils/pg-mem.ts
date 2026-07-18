import 'reflect-metadata';
import { newDb } from 'pg-mem';
import { DataSource, type EntitySchema, type MixedList } from 'typeorm';

/**
 * Spin up an in-memory Postgres (pg-mem) TypeORM `DataSource` for the given
 * entities. pg-mem speaks real Postgres SQL — including `ILIKE` and joined
 * ORDER BY — so the fetch machinery can be exercised end-to-end without a server.
 */
export async function createPgMemDataSource(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entities: MixedList<string | (new (...args: any[]) => unknown) | EntitySchema>,
  ddl: string,
): Promise<DataSource> {
  const db = newDb();
  // TypeORM probes the server version on connect; pg-mem needs it registered.
  db.public.registerFunction({
    name: 'version',
    returns: 'text' as never,
    implementation: () => 'PostgreSQL 14.0 (pg-mem)',
  });
  db.public.registerFunction({
    name: 'current_database',
    returns: 'text' as never,
    implementation: () => 'test',
  });

  // Create the schema directly. TypeORM's `synchronize` runs an
  // information_schema introspection that pg-mem does not support, so we build
  // the tables from explicit DDL and turn synchronize off.
  db.public.none(ddl);

  const dataSource: DataSource = db.adapters.createTypeormDataSource({
    type: 'postgres',
    entities,
    synchronize: false,
  });

  await dataSource.initialize();
  return dataSource;
}
