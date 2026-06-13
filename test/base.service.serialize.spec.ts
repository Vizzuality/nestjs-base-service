import { describe, it, expect, vi } from 'vitest';
import type { Repository } from 'typeorm';
import { BaseService } from '../src/base.service';

// Entity classes whose `constructor` identity drives metadata resolution.
class Author {
  id!: string;
  name!: string;
}
class Book {
  id!: string;
  title!: string;
  author?: Author;
}

const authorMeta = { name: 'Author', primaryColumns: [{ propertyName: 'id' }], relations: [] };
const bookMeta = {
  name: 'Book',
  primaryColumns: [{ propertyName: 'id' }],
  relations: [{ propertyName: 'author' }],
};

function makeRepository(rootMeta: unknown) {
  const dataSource = {
    getMetadata: vi.fn((target: unknown) => {
      if (target === Book) return bookMeta;
      if (target === Author) return authorMeta;
      throw new Error('No metadata for target');
    }),
  };
  return {
    metadata: rootMeta,
    manager: { connection: dataSource },
    createQueryBuilder: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
  } as unknown as Repository<Book>;
}

class BookService extends BaseService<Book, Partial<Book>, Partial<Book>, unknown> {
  constructor(repository: Repository<Book>) {
    super(repository, 'book', { logging: { muteAll: true } });
  }
}

describe('BaseService.serialize', () => {
  const service = new BookService(makeRepository(bookMeta));

  it('serializes a single entity into a JSON:API resource', async () => {
    const book = Object.assign(new Book(), { id: 'b1', title: 'Dune' });
    const doc = await service.serialize(book);
    expect(doc.data).toMatchObject({
      type: 'Book',
      id: 'b1',
      attributes: { title: 'Dune' },
    });
    // id must not leak into attributes
    expect((doc.data as { attributes: Record<string, unknown> }).attributes).not.toHaveProperty(
      'id',
    );
  });

  it('emits relationships and includes related resources listed in includeNames', async () => {
    const book = Object.assign(new Book(), {
      id: 'b1',
      title: 'Dune',
      author: Object.assign(new Author(), { id: 'a1', name: 'Frank' }),
    });
    const doc = await service.serialize(book, undefined, ['author']);

    const data = doc.data as {
      attributes: Record<string, unknown>;
      relationships: Record<string, { data: unknown }>;
    };
    // the relation is linkage, not an attribute
    expect(data.attributes).not.toHaveProperty('author');
    expect(data.relationships.author.data).toMatchObject({ type: 'Author', id: 'a1' });
    // the full related resource lands in `included`
    expect(doc.included).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'Author', id: 'a1', attributes: { name: 'Frank' } }),
      ]),
    );
  });

  it('serializes an array and attaches top-level meta', async () => {
    const books = [
      Object.assign(new Book(), { id: 'b1', title: 'Dune' }),
      Object.assign(new Book(), { id: 'b2', title: 'Hyperion' }),
    ];
    const doc = await service.serialize(books, { totalItems: 2 });
    expect(Array.isArray(doc.data)).toBe(true);
    expect(doc.data).toHaveLength(2);
    expect((doc.data as Array<{ id: string }>)[1]).toMatchObject({ type: 'Book', id: 'b2' });
    expect(doc.meta).toStrictEqual({ totalItems: 2 });
  });

  it('omits meta when none is provided', async () => {
    const doc = await service.serialize(Object.assign(new Book(), { id: 'b1', title: 'Dune' }));
    expect(doc.meta).toBeUndefined();
  });

  it('falls back to the default type when entity metadata cannot be resolved', async () => {
    // An instance whose class is not registered: getMetadata throws → fallback.
    class Unregistered {
      id!: string;
      label!: string;
    }
    const doc = await service.serialize(
      Object.assign(new Unregistered(), { id: 'u1', label: 'x' }) as never,
    );
    // root falls back to the repository metadata name ('Book')
    expect(doc.data).toMatchObject({ type: 'Book', id: 'u1', attributes: { label: 'x' } });
  });

  it('falls back to the configured serializer type for plain objects', async () => {
    class ThingService extends BaseService<{ id: string }, unknown, unknown, unknown> {
      constructor() {
        super({} as unknown as Repository<{ id: string }>, 'thing', {
          logging: { muteAll: true },
          serializer: { type: 'custom-things' },
        });
      }
    }
    const doc = await new ThingService().serialize({ id: 'p1', name: 'plain' } as never);
    expect(doc.data).toMatchObject({
      type: 'custom-things',
      id: 'p1',
      attributes: { name: 'plain' },
    });
  });
});
