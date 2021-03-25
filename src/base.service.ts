import { Logger, NotFoundException, ForbiddenException } from '@nestjs/common';

import { Repository, SelectQueryBuilder } from 'typeorm';

import { IPaginationOptions, paginate, Pagination } from 'nestjs-typeorm-paginate';

import { FetchSpecification } from './types/fetch-specification.interface';
import { FetchUtils } from './utils/fetch.utils';
import { omit, pick } from 'lodash';

/**
 * Base service class for NestJS projects.
 *
 * Provides lifecycle actions for getOne, getMany, create, update and delete.
 */
export abstract class BaseService<Entity extends object, CreateModel, UpdateModel, Info> {
  constructor(
    protected readonly repository: Repository<Entity>,
    protected alias: string = 'base',
    protected idProperty: string = 'id'
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

  /**
   * Utility wrapper around TypeORM's own `SelectQueryBuilder.getRawMany()`, for
   * cases where getting raw results may be needed, but we'd still want to count
   * the number of results because this may make sense.
   *
   * For example, this may typically make sense (depending on context) for
   * `DISTINCT` queries, but not for queries that use aggregation functions
   * (`sum()`, etc.).
   *
   * TL;DR this is raw in both senses of returning raw results *and* of leaving
   * the caller without typical TypeORM safety nets they may be used to, so it
   * needs to be used judiciously and ideally with at the very least the safety
   * net of unit tests and property-based tests.
   */
  async _getRawManyAndCount(query: SelectQueryBuilder<Entity>): Promise<[any[], number]> {
    const results = await query.getRawMany();
    return [results, results.length];
  }

  /**
   * Process `omitFields` - if a user specified any fields in this list,
   * remove matching props from the items in the result set.
   */
  _processOmitFields(
    { omitFields }: Pick<FetchSpecification, 'omitFields'>,
    entities: any[]
  ): any[] {
    return omitFields?.length ? entities.map((e) => omit(e, omitFields)) : entities;
  }

  // ↓↓↓ findAll
  async _prepareFindAllQuery(
    fetchSpecification: FetchSpecification,
    info?: Info
  ): Promise<SelectQueryBuilder<Entity>> {
    const query = this.repository.createQueryBuilder(this.alias);
    const _i = { ...info, fetchSpecification };
    const processedQuery = await this.extendFindAllQuery(query, fetchSpecification, info);
    const queryWithFilters = this.setFilters(processedQuery, fetchSpecification?.filter, info);
    const queryWithFetchSpecificationApplied = FetchUtils.processFetchSpecification<Entity>(
      queryWithFilters,
      this.alias,
      fetchSpecification
    );
    Logger.debug(queryWithFetchSpecificationApplied.getQueryAndParameters());
    return queryWithFetchSpecificationApplied;
  }

  /**
   * Apply any query transformations as needed, for findAll queries.
   *
   * No-op in the base implementation; this function is meant to be overridden
   * in classes that extend BaseService, if there is a need to extend the query
   * beyond what is done when applying filters and fetch specification.
   */
  async extendFindAllQuery(
    query: SelectQueryBuilder<Entity>,
    fetchSpecification: FetchSpecification,
    info: Info
  ): Promise<SelectQueryBuilder<Entity>> {
    return query;
  }

  async findAll(
    fetchSpecification: FetchSpecification,
    info?: Info
  ): Promise<[Partial<Entity>[], number]> {
    Logger.debug(`Finding all ${this.repository.metadata.name}`);
    const query = await this._prepareFindAllQuery(fetchSpecification, info);
    const entitiesAndCount = await query.getManyAndCount();
    const entities = this._processOmitFields(
      { omitFields: fetchSpecification?.omitFields },
      entitiesAndCount[0]
    );
    return [entities, entitiesAndCount[1]];
  }

  /**
   * Variant of findAll() that uses getRawManyAndCount() to retrieve results.
   *
   * See caveats for getRawManyAndCount() about the use of this.
   */
  async findAllRaw(
    fetchSpecification: FetchSpecification,
    info?: Info
  ): Promise<[Partial<Entity>[], number]> {
    Logger.debug(`Finding all ${this.repository.metadata.name} as raw results`);
    const query = await this._prepareFindAllQuery(fetchSpecification, info);
    const entitiesAndCount = await this._getRawManyAndCount(query);
    const entities = this._processOmitFields(
      { omitFields: fetchSpecification?.omitFields },
      entitiesAndCount[0]
    );
    return [entities, entitiesAndCount[1]];
  }

  setFilters(
    query: SelectQueryBuilder<Entity>,
    filters?: unknown,
    info?: Info
  ): SelectQueryBuilder<Entity> {
    return query;
  }
  // ↑↑↑ findAll

  // ↓↓↓ paginate
  async paginate(options: IPaginationOptions): Promise<Pagination<Entity>> {
    return await paginate<Entity>(this.repository, options);
  }
  // ↑↑↑ paginate

  // ↓↓↓ getById
  /**
   * Apply any query transformations as needed, for getById queries.
   *
   * No-op in the base implementation; this function is meant to be overridden
   * in classes that extend BaseService, if there is a need to extend the query
   * beyond what is done when applying filters and fetch specification.
   */
  extendGetByIdQuery(
    query: SelectQueryBuilder<Entity>,
    fetchSpecification: FetchSpecification,
    info?: Info
  ): SelectQueryBuilder<Entity> {
    return query;
  }

  async getById(id: string, fetchSpecification?: FetchSpecification, info?: Info): Promise<Entity> {
    Logger.debug(`Getting ${this.alias} by id`);

    const idColumn = this.idProperty;
    const query = this.repository.createQueryBuilder(this.alias);
    const extendedQuery = this.extendGetByIdQuery(query, fetchSpecification, info);
    const queryWithFetchSpecificationApplied = FetchUtils.processSingleEntityFetchSpecification(
      extendedQuery,
      this.alias,
      pick(fetchSpecification, ['include', 'fields', 'omitFields', 'filter'])
    );
    queryWithFetchSpecificationApplied
      .andWhere(`${this.alias}.${idColumn} = :id`)
      .setParameter('id', id);
    Logger.debug(queryWithFetchSpecificationApplied.getQueryAndParameters());
    const model = await queryWithFetchSpecificationApplied.getOne();
    if (!model) {
      throw new NotFoundException(`${this.alias} not found.`);
    }
    const entities = this._processOmitFields({ omitFields: fetchSpecification?.omitFields }, [
      model,
    ]);
    return entities[0];
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
