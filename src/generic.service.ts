import { Logger, NotFoundException, ForbiddenException } from '@nestjs/common';

import { Repository, SelectQueryBuilder } from 'typeorm';

import { InfoDto } from 'dto/info.dto';
import { GenericEntity } from './generic.entity';

import { IPaginationOptions, paginate, Pagination } from 'nestjs-typeorm-paginate';

/**
 * Base service class for NestJS projects.
 *
 * Provides lifecycle actions for getOne, getMany, create, update and delete.
 */
export abstract class GenericService<E extends GenericEntity, C, U> {
  constructor(protected readonly repository: Repository<E>, protected alias: string = 'master') {}

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
  async setDataCreate(create: C, info?: U): Promise<E> {
    /**
     * Probably not the best way of doing it but it should address at least
     * simple use cases. See:
     * https://stackoverflow.com/questions/17382143/create-a-new-object-from-type-parameter-in-generic-class#26696476
     */
    const model = {};

    Object.entries(create).forEach(([key, value]) => {
      model[key] = value;
    });

    return model as E;
  }

  /*
   * Updates the given instance of the entity
   *
   * @param model The current instance
   * @param update Properties to apply as update.
   * @param info Additional request metadata
   * @return The updated entity instance
   */
  async setDataUpdate(model: E, update: U, info?: U): Promise<E> {
    Object.entries(update).forEach(([key, value]) => {
      model[key] = value;
    });

    return model;
  }

  // ↓↓↓ findAll
  findAll(info?: U, filters: any = null): Promise<E[]> {
    Logger.debug(`Finding all ${this.repository.metadata.name}`);
    let query = this.repository.createQueryBuilder(this.alias);
    query = this.setFilters(query, filters, info);
    return query.getMany();
  }

  setFilters(query: SelectQueryBuilder<E>, filters: any, info: U) {
    return query;
  }
  // ↑↑↑ findAll

  // ↓↓↓ paginate
  async paginate(options: IPaginationOptions): Promise<Pagination<E>> {
    return await paginate<E>(this.repository, options);
  }
  // ↑↑↑ paginate

  // ↓↓↓ getById
  setFiltersGetById(query: SelectQueryBuilder<E>, info: U): SelectQueryBuilder<E> {
    return query;
  }

  async getById(id: string, info?: U): Promise<E> {
    Logger.debug(`Getting ${this.alias} by id`);
    let query = this.repository.createQueryBuilder(this.alias);
    query = this.setFiltersGetById(query, info);
    query.andWhere(`${this.alias}.id = :id`).setParameter('id', id);
    const model = await query.getOne();
    if (!model) {
      throw new NotFoundException(`${this.alias} not found.`);
    }
    return model;
  }
  // ↑↑↑ getById

  // ↓↓↓ create
  async validateBeforeCreate(createModel: C, info: U): Promise<void> {
    return;
  }

  async actionAfterCreate(model: E, createModel: C, info: U): Promise<void> {
    return;
  }

  async create(createModel: C, info?: U): Promise<E> {
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
  async validateBeforeUpdate(id: string, updateModel: U, info?: U): Promise<void> {
    return;
  }

  setFiltersUpdate(query: SelectQueryBuilder<E>, info: U): SelectQueryBuilder<E> {
    return query;
  }

  async actionBeforeUpdate(id: string, updateModel: U, info: U): Promise<void> {
    return;
  }

  async actionAfterUpdate(model: E, updateModel: U, info: U): Promise<void> {
    return;
  }

  async update(id: string, updateModel: U, info?: U): Promise<E> {
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
  setFiltersDelete(query: SelectQueryBuilder<E>, info: U): SelectQueryBuilder<E> {
    return query;
  }

  canBeRemoved(id: string, model: E, info?: U): boolean {
    return true;
  }

  async remove(id: string, info?: U): Promise<void> {
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

  async removeMany(idList: string[], info?: U): Promise<void> {
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
