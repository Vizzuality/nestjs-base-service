import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryColumn } from 'typeorm';

/**
 * Fixture graph for the Part D (nested-relation) tests, mirroring the Acorn
 * driver shape:
 *
 *   Farm ──(to-one)──▶ Project ──(to-one)──▶ Organisation
 *   Organisation ──(to-many)──▶ Project ──(to-many)──▶ Farm
 *
 * to-one chains (`project`, `project.organisation`) exercise nested sort /
 * filter / search; the to-many back-references (`projects`, `farms`) exercise the
 * to-many rejection guard.
 *
 * Table and join-column names are explicit so the pg-mem harness can create the
 * schema with matching DDL (TypeORM's `synchronize` introspection is unsupported
 * by pg-mem). String primary keys avoid needing a uuid extension.
 */

@Entity({ name: 'organisation' })
export class Organisation {
  @PrimaryColumn('text')
  id!: string;

  @Column('text')
  name!: string;

  @OneToMany(() => Project, (project) => project.organisation)
  projects!: Project[];
}

@Entity({ name: 'project' })
export class Project {
  @PrimaryColumn('text')
  id!: string;

  @Column('text')
  name!: string;

  @ManyToOne(() => Organisation, (organisation) => organisation.projects)
  @JoinColumn({ name: 'organisation_id' })
  organisation!: Organisation;

  @OneToMany(() => Farm, (farm) => farm.project)
  farms!: Farm[];
}

@Entity({ name: 'farm' })
export class Farm {
  @PrimaryColumn('text')
  id!: string;

  @Column('text')
  name!: string;

  @ManyToOne(() => Project, (project) => project.farms)
  @JoinColumn({ name: 'project_id' })
  project!: Project;
}

/** DDL matching the fixture entities, for pg-mem (bypasses TypeORM synchronize). */
export const FIXTURE_DDL = `
  CREATE TABLE "organisation" ("id" text PRIMARY KEY, "name" text NOT NULL);
  CREATE TABLE "project" ("id" text PRIMARY KEY, "name" text NOT NULL, "organisation_id" text);
  CREATE TABLE "farm" ("id" text PRIMARY KEY, "name" text NOT NULL, "project_id" text);
`;
