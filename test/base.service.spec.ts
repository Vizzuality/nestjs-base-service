import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { paginate } from 'nestjs-typeorm-paginate';
import type { Repository } from 'typeorm';
import { BaseService } from '../src/base.service';

// paginate() does an `instanceof Repository` check internally, which a plain
// mock can't satisfy; mock the boundary and assert BaseService delegates to it.
vi.mock('nestjs-typeorm-paginate', () => ({ paginate: vi.fn() }));

interface Item {
  id: string;
  name: string;
  secret: string;
  status: string;
}

/** Chainable query-builder mock; terminal results are injected per test. */
function makeQueryBuilder(terminals: Partial<Record<string, unknown>> = {}) {
  const qb: Record<string, unknown> = {};
  for (const method of [
    'select',
    'leftJoinAndSelect',
    'addOrderBy',
    'take',
    'skip',
    'limit',
    'offset',
    'andWhere',
    'where',
    'setParameter',
  ]) {
    qb[method] = vi.fn(() => qb);
  }
  qb.getQueryAndParameters = vi.fn(() => ['SQL', []]);
  qb.getManyAndCount = vi.fn(async () => terminals.getManyAndCount ?? [[], 0]);
  qb.getRawMany = vi.fn(async () => terminals.getRawMany ?? []);
  qb.getCount = vi.fn(async () => terminals.getCount ?? 0);
  qb.getOne = vi.fn(async () => terminals.getOne ?? null);
  qb.getMany = vi.fn(async () => terminals.getMany ?? []);
  return qb;
}

function makeRepository(qb: Record<string, unknown>) {
  return {
    createQueryBuilder: vi.fn(() => qb),
    save: vi.fn(async (model: unknown) => model),
    remove: vi.fn(async (model: unknown) => model),
    findAndCount: vi.fn(async () => [[], 0]),
  } as unknown as Repository<Item> & Record<string, ReturnType<typeof vi.fn>>;
}

class ItemService extends BaseService<Item, Partial<Item>, Partial<Item>, unknown> {
  constructor(repository: Repository<Item>) {
    super(repository, 'item', { logging: { muteAll: true } });
  }
}

describe('BaseService', () => {
  let qb: Record<string, unknown>;
  let repository: Repository<Item> & Record<string, ReturnType<typeof vi.fn>>;
  let service: ItemService;

  const sample: Item = { id: '1', name: 'a', secret: 'sssh', status: 'active' };

  beforeEach(() => {
    qb = makeQueryBuilder();
    repository = makeRepository(qb);
    service = new ItemService(repository);
  });

  describe('findAll', () => {
    it('returns the entities and the total count', async () => {
      (qb.getManyAndCount as ReturnType<typeof vi.fn>).mockResolvedValueOnce([[sample], 1]);
      const [entities, count] = await service.findAll();
      expect(entities).toStrictEqual([sample]);
      expect(count).toBe(1);
    });

    it('strips omitFields from the results', async () => {
      (qb.getManyAndCount as ReturnType<typeof vi.fn>).mockResolvedValueOnce([[sample], 1]);
      const [entities] = await service.findAll({ omitFields: ['secret'] });
      expect(entities[0]).not.toHaveProperty('secret');
      expect(entities[0]).toMatchObject({ id: '1', name: 'a' });
    });

    it('applies array filters as a parameterised IN clause', async () => {
      await service.findAll({ filter: { status: ['active', 'pending'] } });
      expect(qb.andWhere).toHaveBeenCalledWith('item.status IN (:...statusValues)', {
        statusValues: ['active', 'pending'],
      });
    });
  });

  describe('findAllRaw', () => {
    it('returns raw rows with the total count from getCount (ignoring pagination)', async () => {
      const rows = [{ item_id: '1' }, { item_id: '2' }];
      (qb.getRawMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce(rows);
      (qb.getCount as ReturnType<typeof vi.fn>).mockResolvedValueOnce(7);
      const [entities, count] = await service.findAllRaw();
      expect(entities).toStrictEqual(rows);
      expect(count).toBe(7); // total matching rows, not the page length
    });
  });

  describe('getById', () => {
    it('returns the entity when found', async () => {
      (qb.getOne as ReturnType<typeof vi.fn>).mockResolvedValueOnce(sample);
      await expect(service.getById('1')).resolves.toStrictEqual(sample);
    });

    it('binds the id parameter against the configured id property', async () => {
      (qb.getOne as ReturnType<typeof vi.fn>).mockResolvedValueOnce(sample);
      await service.getById('1');
      expect(qb.andWhere).toHaveBeenCalledWith('item.id = :id');
      expect(qb.setParameter).toHaveBeenCalledWith('id', '1');
    });

    it('applies sparse fieldsets and includes from the fetch specification', async () => {
      (qb.getOne as ReturnType<typeof vi.fn>).mockResolvedValueOnce(sample);
      await service.getById('1', { fields: ['name'], include: ['relation'] });
      expect(qb.select).toHaveBeenCalledWith(['item.name']);
      expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('item.relation', 'relation');
    });

    it('strips omitFields from the returned entity', async () => {
      (qb.getOne as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ...sample });
      const result = await service.getById('1', { omitFields: ['secret'] });
      expect(result).not.toHaveProperty('secret');
    });

    it('throws NotFoundException when missing', async () => {
      (qb.getOne as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
      await expect(service.getById('nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('paginate', () => {
    it('delegates to nestjs-typeorm-paginate with the repository and options', async () => {
      const expected = { items: [sample], meta: { totalItems: 1 } };
      (paginate as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(expected);
      const options = { page: 1, limit: 10 };
      const page = await service.paginate(options);
      expect(paginate).toHaveBeenCalledWith(repository, options);
      expect(page).toStrictEqual(expected);
    });
  });

  describe('create', () => {
    it('saves the model and runs validate + after-create hooks', async () => {
      const validate = vi.spyOn(service, 'validateBeforeCreate');
      const after = vi.spyOn(service, 'actionAfterCreate');
      const result = await service.create({ name: 'new', status: 'active' });
      expect(repository.save).toHaveBeenCalledOnce();
      expect(result).toMatchObject({ name: 'new', status: 'active' });
      expect(validate).toHaveBeenCalledOnce();
      expect(after).toHaveBeenCalledOnce();
    });

    it('propagates repository errors', async () => {
      (repository.save as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('db down'));
      await expect(service.create({ name: 'x' })).rejects.toThrow('db down');
    });
  });

  describe('update', () => {
    it('updates an existing entity and runs hooks', async () => {
      (qb.getOne as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ...sample });
      const before = vi.spyOn(service, 'actionBeforeUpdate');
      const after = vi.spyOn(service, 'actionAfterUpdate');
      const result = await service.update('1', { name: 'renamed' });
      expect(result).toMatchObject({ id: '1', name: 'renamed' });
      expect(repository.save).toHaveBeenCalledOnce();
      expect(before).toHaveBeenCalledOnce();
      expect(after).toHaveBeenCalledOnce();
    });

    it('throws NotFoundException when the target does not exist', async () => {
      (qb.getOne as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
      await expect(service.update('nope', { name: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('propagates repository errors on save', async () => {
      (qb.getOne as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ...sample });
      (repository.save as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('db down'));
      await expect(service.update('1', { name: 'x' })).rejects.toThrow('db down');
    });
  });

  describe('remove', () => {
    it('removes the entity when canBeRemoved allows it', async () => {
      (qb.getOne as ReturnType<typeof vi.fn>).mockResolvedValueOnce(sample);
      await service.remove('1');
      expect(repository.remove).toHaveBeenCalledWith(sample);
    });

    it('throws NotFoundException when the entity is missing', async () => {
      (qb.getOne as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
      await expect(service.remove('nope')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ForbiddenException when canBeRemoved returns false', async () => {
      (qb.getOne as ReturnType<typeof vi.fn>).mockResolvedValueOnce(sample);
      vi.spyOn(service, 'canBeRemoved').mockResolvedValueOnce(false);
      await expect(service.remove('1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(repository.remove).not.toHaveBeenCalled();
    });

    it('queries by the configured idProperty (not a hardcoded "id")', async () => {
      const uuidService = new (class extends BaseService<
        Item,
        Partial<Item>,
        Partial<Item>,
        unknown
      > {
        constructor() {
          super(repository, 'item', { idProperty: 'uuid', logging: { muteAll: true } });
        }
      })();
      (qb.getOne as ReturnType<typeof vi.fn>).mockResolvedValueOnce(sample);
      await uuidService.remove('abc');
      expect(qb.andWhere).toHaveBeenCalledWith('item.uuid = :id');
    });
  });

  describe('removeMany', () => {
    it('removes all found records', async () => {
      const records = [sample, { ...sample, id: '2' }];
      (qb.getMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce(records);
      await service.removeMany(['1', '2']);
      expect(repository.remove).toHaveBeenCalledWith(records);
    });

    it('does nothing when no records match', async () => {
      (qb.getMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
      await service.removeMany(['x']);
      expect(repository.remove).not.toHaveBeenCalled();
    });

    it('queries by the configured idProperty (not a hardcoded "id")', async () => {
      const uuidService = new (class extends BaseService<
        Item,
        Partial<Item>,
        Partial<Item>,
        unknown
      > {
        constructor() {
          super(repository, 'item', { idProperty: 'uuid', logging: { muteAll: true } });
        }
      })();
      (qb.getMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([sample]);
      await uuidService.removeMany(['a', 'b']);
      expect(qb.where).toHaveBeenCalledWith('item.uuid IN (:...idList)', { idList: ['a', 'b'] });
    });
  });
});
