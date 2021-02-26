import { Logger, NotFoundException, ForbiddenException } from '@nestjs/common';

import { Repository, SelectQueryBuilder } from 'typeorm';

import { IPaginationOptions, paginate, Pagination } from 'nestjs-typeorm-paginate';

import { FetchSpecification } from './types/fetch-specification.interface';
import { PaginationUtils } from './utils/pagination.utils';

/**
 * Base service class for NestJS projects.
 *
 * Provides lifecycle actions for getOne, getMany, create, update and delete.
 */
export abstract class BaseService<Entity, CreateModel, UpdateModel, Info> {
  constructor(
    protected readonly repository: Repository<Entity>,
    protected alias: string = 'base'
  ) {}

  /*
   * setDataCreate and setDataUpdate will usually be overwritten
   * but here is a very basic default implementation.
   */

  /*
   * Creates a new instance of the given entity
   *
   * @param create Properties of the instance to create.
   * @param info Additional request metadata
   * @return The entity instance to be created
   */
  async setDataCreate(create: CreateModel, info?: Info): Promise<Entity> {
    /**
     * Probably not the best way of doing it but it should address at least
     * simple use cases. See:
     * https://stackoverflow.com/questions/17382143/create-a-new-object-from-type-parameter-in-generic-class#26696476
     */
    const model = {};

    Object.entries(create).forEach(([key, value]) => {
      model[key] = value;
    });

    return model as Entity;
  }

  /*
   * Updates the given instance of the entity
   *
   * @param model The current instance
   * @param update Properties to apply as update.
   * @param info Additional request metadata
   * @return The updated entity instance
   */
  async setDataUpdate(model: Entity, update: UpdateModel, info?: Info): Promise<Entity> {
    Object.entries(update).forEach(([key, value]) => {
      model[key] = value;
    });

    return model;
  }

  // ↓↓↓ findAll
  findAll(
    fetchSpecification: FetchSpecification,
    info?: Info,
    filters: any = null
  ): Promise<[Entity[], number]> {
    Logger.debug(`Finding all ${this.repository.metadata.name}`);
    let query = this.repository.createQueryBuilder(this.alias);
    info = { ...info, fetchSpecification };
    query = this.setFilters(query, filters, info);
    query = PaginationUtils.addPagination<Entity>(query, this.alias, fetchSpecification);
    return query.getManyAndCount();
  }

  setFilters(query: SelectQueryBuilder<Entity>, filters: any, info?: Info) {
    return query;
  }
  // ↑↑↑ findAll

  // ↓↓↓ paginate
  async paginate(options: IPaginationOptions): Promise<Pagination<Entity>> {
    return await paginate<Entity>(this.repository, options);
  }
  // ↑↑↑ paginate

  // ↓↓↓ getById
  setFiltersGetById(
    query: SelectQueryBuilder<Entity>,
    info?: Info,
    idProperty?: string
  ): SelectQueryBuilder<Entity> {
    return query;
  }

  async getById(id: string, info?: Info, idProperty?: string): Promise<Entity> {
    Logger.debug(`Getting ${this.alias} by id`);
    /**
     * @debt We should sanitize this. We should not put the burden of checking
     * that idProperty does not include user input on consumers of our package.
     */
    const idColumn = typeof idProperty === 'string' && idProperty.length > 0 ? idProperty : 'id';
    const query = this.repository.createQueryBuilder(this.alias);
    const queryWithFilters = this.setFiltersGetById(query, info, idProperty);
    queryWithFilters.andWhere(`"${this.alias}"."${idColumn}" = :id`).setParameter('id', id);
    const model = await queryWithFilters.getOne();
    if (!model) {
      throw new NotFoundException(`${this.alias} not found.`);
    }
    return model;
  }
  // ↑↑↑ getById

  // ↓↓↓ create
  async validateBeforeCreate(createModel: CreateModel, info?: Info): Promise<void> {
    return;
  }

  async actionAfterCreate(model: Entity, createModel: CreateModel, info?: Info): Promise<void> {
    return;
  }

  async create(createModel: CreateModel, info?: Info): Promise<Entity> {
    Logger.debug(`Creating ${this.alias}`);

    await this.validateBeforeCreate(createModel, info);
    const model = await this.setDataCreate(createModel, info);

    return new Promise((resolve, reject) => {
      this.repository
        .save(model)
        .then((result) => {
          if (this.actionAfterCreate) this.actionAfterCreate(result, createModel, info);
          resolve(result);
        })
        .catch((e) => reject(e));
    });
  }
  // ↑↑↑ create

  // ↓↓↓ update
  async validateBeforeUpdate(id: string, updateModel: UpdateModel, info?: Info): Promise<void> {
    return;
  }

  setFiltersUpdate(query: SelectQueryBuilder<Entity>, info?: Info): SelectQueryBuilder<Entity> {
    return query;
  }

  async actionBeforeUpdate(id: string, updateModel: UpdateModel, info?: Info): Promise<void> {
    return;
  }

  async actionAfterUpdate(model: Entity, updateModel: UpdateModel, info?: Info): Promise<void> {
    return;
  }

  async update(id: string, updateModel: UpdateModel, info?: Info): Promise<Entity> {
    Logger.debug(`Updating ${this.alias}`);
    await this.actionBeforeUpdate(id, updateModel, info);
    await this.validateBeforeUpdate(id, updateModel, info);
    let query = this.repository.createQueryBuilder(this.alias);
    query = this.setFiltersUpdate(query, info);
    query.andWhere(`${this.alias}.id = :id`).setParameter('id', id);
    let model = await query.getOne();
    if (!model) {
      throw new NotFoundException(`${this.alias} not found.`);
    }
    model = await this.setDataUpdate(model, updateModel, info);
    return new Promise((resolve, reject) => {
      this.repository
        .save(model)
        .then((result) => {
          if (this.actionAfterUpdate) this.actionAfterUpdate(result, updateModel, info);
          resolve(result);
        })
        .catch((e) => reject(e));
    });
  }
  // ↑↑↑ update

  // ↓↓↓ delete
  setFiltersDelete(query: SelectQueryBuilder<Entity>, info?: Info): SelectQueryBuilder<Entity> {
    return query;
  }

  canBeRemoved(id: string, model: Entity, info?: Info): boolean {
    return true;
  }

  async remove(id: string, info?: Info): Promise<void> {
    Logger.debug(`Removing a ${this.alias}`);
    let query = this.repository.createQueryBuilder(this.alias);
    query = this.setFiltersDelete(query, info);
    query.andWhere(`${this.alias}.id = :id`).setParameter('id', id);
    const model = await query.getOne();
    if (!model) {
      throw new NotFoundException(`${this.alias} not found.`);
    }
    if (this.canBeRemoved(id, model, info)) {
      await this.repository.remove(model);
    } else {
      throw new ForbiddenException(`No suitable permissions to delete this ${this.alias}.`);
    }
  }

  async removeMany(idList: string[], info?: Info): Promise<void> {
    Logger.debug(`Removing multiple ${this.alias}`);
    const query = this.repository
      .createQueryBuilder(this.alias)
      .where(`${this.alias}.id IN (:...idList)`, { idList });
    const foundRecords = await query.getMany();
    if (foundRecords && foundRecords.length) {
      this.repository.remove(foundRecords);
    }
  }
  // ↑↑↑ delete
}
