import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryColumn } from 'typeorm';

/**
 * Fixture graph for the nested-relation tests:
 *
 *   Comment ──(to-one)──▶ Photo ──(to-one)──▶ Author
 *   Author ──(to-many)──▶ Photo ──(to-many)──▶ Comment
 *
 * to-one chains (`photo`, `photo.author`) exercise nested sort / filter / search;
 * the to-many back-references (`photos`, `comments`) exercise the to-many
 * rejection guard.
 *
 * Table and join-column names are explicit so the pg-mem harness can create the
 * schema with matching DDL (TypeORM's `synchronize` introspection is unsupported
 * by pg-mem). String primary keys avoid needing a uuid extension.
 */

@Entity({ name: 'author' })
export class Author {
  @PrimaryColumn('text')
  id!: string;

  @Column('text')
  name!: string;

  @OneToMany(() => Photo, (photo) => photo.author)
  photos!: Photo[];
}

@Entity({ name: 'photo' })
export class Photo {
  @PrimaryColumn('text')
  id!: string;

  @Column('text')
  title!: string;

  @ManyToOne(() => Author, (author) => author.photos)
  @JoinColumn({ name: 'author_id' })
  author!: Author;

  @OneToMany(() => Comment, (comment) => comment.photo)
  comments!: Comment[];
}

@Entity({ name: 'comment' })
export class Comment {
  @PrimaryColumn('text')
  id!: string;

  @Column('text')
  body!: string;

  @ManyToOne(() => Photo, (photo) => photo.comments)
  @JoinColumn({ name: 'photo_id' })
  photo!: Photo;

  // A scalar column literally named `photo_title`: its filter/search key
  // normalises to the SAME base param name as the relation path `photo.title`
  // (`photo.title` → `photo_title`). Used to prove the param-collision fix.
  @Column('text', { name: 'photo_title', nullable: true })
  photo_title!: string | null;
}

/** DDL matching the fixture entities, for pg-mem (bypasses TypeORM synchronize). */
export const FIXTURE_DDL = `
  CREATE TABLE "author" ("id" text PRIMARY KEY, "name" text NOT NULL);
  CREATE TABLE "photo" ("id" text PRIMARY KEY, "title" text NOT NULL, "author_id" text);
  CREATE TABLE "comment" ("id" text PRIMARY KEY, "body" text NOT NULL, "photo_id" text, "photo_title" text);
`;
