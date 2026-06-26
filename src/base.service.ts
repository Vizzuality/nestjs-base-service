import { Logger, NotFoundException, ForbiddenException, LoggerService } from '@nestjs/common';

import { Repository, SelectQueryBuilder } from 'typeorm';

import { IPaginationOptions, paginate, Pagination } from 'nestjs-typeorm-paginate';

import { FetchSpecification } from './types/fetch-specification.interface';
import { FetchUtils } from './utils/fetch.utils';
import { omit, pick } from './utils/object.utils';
import { EntityPropertiesMapper } from './serialization/entity-properties-mapper';

/** A single JSON:API resource object. */
export interface JsonApiResource {
  type: string;
  id?: string | number;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, unknown>;
  links?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

/** A serialized JSON:API document, as produced by `BaseService.serialize()`. */
export interface JsonApiDocument {
  data?: JsonApiResource | JsonApiResource[];
  included?: JsonApiResource[];
  meta?: Record<string, unknown>;
}

class NoOpLogger implements LoggerService {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  log(message: unknown) {}
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  error(message: unknown, trace: unknown) {}
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  warn(message: unknown) {}
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  debug(message: unknown) {}
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  verbose(message: unknown) {}
}

export type BaseServiceOptions = {
  idProperty?: string;
  logging?: { muteAll?: boolean };
  /**
   * Options for `serialize()`. `type` sets the JSON:API resource `type` for
   * this service's root entity; when omitted it is resolved from the entity's
   * TypeORM metadata name, falling back to the service alias.
   */
  serializer?: { type?: string };
};
/**
 * Base service class for NestJS projects.
 *
 * Provides lifecycle actions for getOne, getMany, create, update and delete.
 */
export abstract class BaseService<Entity extends object, CreateModel, UpdateModel, Info> {
  protected logger: Logger | NoOpLogger;
  private readonly options: BaseServiceOptions;

  constructor(
    protected readonly repository: Repository<Entity>,
    protected alias: string = 'base',
    protected serviceOptions: BaseServiceOptions,
  ) {
    this.options = Object.assign({ idProperty: 'id', logging: { muteAll: false } }, serviceOptions);
    this.logger = this.options.logging?.muteAll ? new NoOpLogger() : new Logger(this.alias);
  }

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
    // `getCount()` ignores the query's own LIMIT/OFFSET, so it reflects the
    // total number of matching rows rather than the size of the current page.
    // Note the caveat above: for queries using aggregation this total may not
    // be meaningful.
    const [results, total] = await Promise.all([query.getRawMany(), query.getCount()]);
    return [results, total];
  }

  /**
   * Process `omitFields` - if a user specified any fields in this list,
   * remove matching props from the items in the result set.
   */
  _processOmitFields(
    { omitFields }: Pick<FetchSpecification, 'omitFields'>,
    entities: any[],
  ): any[] {
    return omitFields?.length ? entities.map((e) => omit(e, omitFields)) : entities;
  }

  // ↓↓↓ findAll
  async _prepareFindAllQuery(
    fetchSpecification: FetchSpecification,
    info?: Info,
  ): Promise<SelectQueryBuilder<Entity>> {
    const query = this.repository.createQueryBuilder(this.alias);
    const _i = { ...info, fetchSpecification };
    const processedQuery = await this.extendFindAllQuery(query, fetchSpecification, info);
    const queryWithFilters = await this.setFilters(
      processedQuery,
      fetchSpecification?.filter,
      info,
    );
    const queryWithSearch = await this.setSearch(
      queryWithFilters,
      fetchSpecification?.search,
      info,
    );
    const queryWithFetchSpecificationApplied = FetchUtils.processFetchSpecification<Entity>(
      queryWithSearch,
      this.alias,
      fetchSpecification,
    );
    this.logger.debug(queryWithFetchSpecificationApplied.getQueryAndParameters());
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
    info: Info,
  ): Promise<SelectQueryBuilder<Entity>> {
    return query;
  }

  async findAll(
    fetchSpecification?: FetchSpecification,
    info?: Info,
  ): Promise<[Partial<Entity>[], number]> {
    this.logger.debug(`Finding all ${this.alias}`);
    const query = await this._prepareFindAllQuery(fetchSpecification, info);
    const entitiesAndCount = await query.getManyAndCount();
    const extendedEntitiesAndCount = await this.extendFindAllResults(
      entitiesAndCount,
      fetchSpecification,
      info,
    );
    const entities = this._processOmitFields(
      { omitFields: fetchSpecification?.omitFields },
      extendedEntitiesAndCount[0],
    );
    return [entities, extendedEntitiesAndCount[1]];
  }

  /**
   * Variant of findAll() that uses getRawManyAndCount() to retrieve results.
   *
   * See caveats for getRawManyAndCount() about the use of this.
   */
  async findAllRaw(
    fetchSpecification?: FetchSpecification,
    info?: Info,
  ): Promise<[Partial<Entity>[], number]> {
    this.logger.debug(`Finding all ${this.alias} as raw results`);
    const query = await this._prepareFindAllQuery(fetchSpecification, info);
    const entitiesAndCount = await this._getRawManyAndCount(query);
    const extendedEntitiesAndCount = await this.extendFindAllResults(
      entitiesAndCount,
      fetchSpecification,
      info,
    );
    const entities = this._processOmitFields(
      { omitFields: fetchSpecification?.omitFields },
      extendedEntitiesAndCount[0],
    );
    return [entities, extendedEntitiesAndCount[1]];
  }

  /**
   * At this stage, the results fetched from db can be further reshaped or
   * extended.
   *
   * For example, data fetched from other sources can be added to the entities,
   * if these are set up as DTOs.
   *
   * @todo Proper support for result DTOs should be added later on.
   */
  async extendFindAllResults(
    entitiesAndCount: [any[], number],
    fetchSpecification?: FetchSpecification,
    info?: Info,
  ): Promise<[any[], number]> {
    return entitiesAndCount;
  }

  async setFilters(
    query: SelectQueryBuilder<Entity>,
    filters?: Record<string, any>,
    info?: Info,
  ): Promise<SelectQueryBuilder<Entity>> {
    return this._processBaseFilters(query, filters, Object.keys(filters || {}));
  }

  protected _processBaseFilters<Filters>(
    query: SelectQueryBuilder<Entity>,
    filters: Filters,
    filterKeys: any,
  ): SelectQueryBuilder<Entity> {
    if (filters) {
      Object.entries(filters)
        .filter((i) => Array.from(filterKeys).includes(i[0]))
        .forEach((i) => this._processBaseFilter(query, i));
    }

    return query;
  }

  protected _processBaseFilter(
    query: SelectQueryBuilder<Entity>,
    [filterKey, filterValues]: [string, unknown],
  ): SelectQueryBuilder<Entity> {
    if (Array.isArray(filterValues) && filterValues.length) {
      query.andWhere(`${this.alias}.${filterKey} IN (:...${filterKey}Values)`, {
        [`${filterKey}Values`]: filterValues,
      });
    }
    return query;
  }

  /**
   * Apply partial-match search terms to the query.
   *
   * Each entry in `search` is matched as a case-insensitive substring against
   * its column (SQL `ILIKE '%term%'`), unlike `setFilters()` which matches
   * values exactly. Multiple search terms are AND'd together (and AND'd with
   * any exact filters). Override to customise (e.g. to OR terms, or to search
   * across joined columns).
   */
  async setSearch(
    query: SelectQueryBuilder<Entity>,
    search?: Record<string, any>,
    info?: Info,
  ): Promise<SelectQueryBuilder<Entity>> {
    return this._processBaseSearch(query, search, Object.keys(search || {}));
  }

  protected _processBaseSearch<Search>(
    query: SelectQueryBuilder<Entity>,
    search: Search,
    searchKeys: any,
  ): SelectQueryBuilder<Entity> {
    if (search) {
      Object.entries(search)
        .filter((i) => Array.from(searchKeys).includes(i[0]))
        .forEach((i) => this._processBaseSearchTerm(query, i));
    }

    return query;
  }

  protected _processBaseSearchTerm(
    query: SelectQueryBuilder<Entity>,
    [searchKey, searchTerm]: [string, unknown],
  ): SelectQueryBuilder<Entity> {
    if (typeof searchTerm === 'string' && searchTerm.length) {
      query.andWhere(`${this.alias}.${searchKey} ILIKE :${searchKey}Search`, {
        [`${searchKey}Search`]: `%${searchTerm}%`,
      });
    }
    return query;
  }

  // ↑↑↑ findAll

  // ↓↓↓ paginate
  async paginate(options: IPaginationOptions): Promise<Pagination<Entity>> {
    return await paginate<Entity>(this.repository, options);
  }
  // ↑↑↑ paginate

  // ↓↓↓ serialize
  /**
   * Serialize one or more entities into a JSON:API document.
   *
   * The resource `type`, `id`, attributes and relationships are derived from
   * the entity's TypeORM metadata. Pass `includeNames` (relation property
   * names, dot-notation for nested) to embed related resources in the
   * `included` section; pass `meta` to attach a top-level `meta` member.
   *
   * Requires the optional peer dependency `jsona`, which is imported lazily so
   * that consumers who do their own serialization need not install it.
   */
  async serialize(
    data: Partial<Entity> | Partial<Entity>[],
    meta?: Record<string, unknown>,
    includeNames?: string[],
  ): Promise<JsonApiDocument> {
    const jsonaModule = await import('jsona').catch(() => {
      throw new Error(
        "BaseService.serialize() requires the optional peer dependency 'jsona'. Install it with `pnpm add jsona`.",
      );
    });
    const fallbackType =
      this.options.serializer?.type ?? this.repository.metadata?.name ?? this.alias;
    const formatter = new jsonaModule.Jsona({
      // EntityPropertiesMapper structurally implements jsona's
      // IModelPropertiesMapper without importing jsona (see its docs).
      modelPropertiesMapper: new EntityPropertiesMapper(
        this.repository.manager?.connection,
        fallbackType,
        this.options.idProperty ?? 'id',
      ) as never,
    });
    const document = formatter.serialize({
      stuff: data as never,
      includeNames,
    }) as unknown as JsonApiDocument;
    return meta ? { ...document, meta } : document;
  }
  // ↑↑↑ serialize

  // ↓↓↓ getById
  /**
   * Apply any query transformations as needed, for getById queries.
   *
   * No-op in the base implementation; this function is meant to be overridden
   * in classes that extend BaseService, if there is a need to extend the query
   * beyond what is done when applying filters and fetch specification.
   */
  async extendGetByIdQuery(
    query: SelectQueryBuilder<Entity>,
    fetchSpecification?: FetchSpecification,
    info?: Info,
  ): Promise<SelectQueryBuilder<Entity>> {
    return query;
  }

  async getById(id: string, fetchSpecification?: FetchSpecification, info?: Info): Promise<Entity> {
    this.logger.debug(`Getting ${this.alias} by id`);

    const query = this.repository.createQueryBuilder(this.alias);
    const extendedQuery = await this.extendGetByIdQuery(query, fetchSpecification, info);
    const queryWithFetchSpecificationApplied = FetchUtils.processSingleEntityFetchSpecification(
      extendedQuery,
      this.alias,
      pick(fetchSpecification, ['include', 'fields', 'omitFields', 'filter']),
    );
    queryWithFetchSpecificationApplied
      .andWhere(`${this.alias}.${this.options.idProperty} = :id`)
      .setParameter('id', id);
    this.logger.debug(queryWithFetchSpecificationApplied.getQueryAndParameters());
    const model = await queryWithFetchSpecificationApplied.getOne();
    if (!model) {
      throw new NotFoundException(`${this.alias} not found.`);
    }
    const extendedEntity = await this.extendGetByIdResult(model, fetchSpecification, info);
    const entities = this._processOmitFields({ omitFields: fetchSpecification?.omitFields }, [
      extendedEntity,
    ]);
    return entities[0];
  }

  /**
   * At this stage, the results fetched from db can be further reshaped or
   * extended.
   *
   * For example, data fetched from other sources can be added to the entity, if
   * this is set up as a DTO.
   *
   * @todo Proper support for result DTOs should be added later on: this
   * function should then return a `Promise<ResultDTO>` instead.
   */
  async extendGetByIdResult(
    entity: Entity,
    fetchSpecification?: FetchSpecification,
    info?: Info,
  ): Promise<Entity> {
    return entity;
  }
  // ↑↑↑ getById

  // ↓↓↓ create
  async validateBeforeCreate(createModel: CreateModel, info?: Info): Promise<void> {
    return;
  }

  async actionAfterCreate(model: Entity, createModel: CreateModel, info?: Info): Promise<void> {
    return;
  }

  /**
   * At this stage, the results fetched from db can be further reshaped or
   * extended.
   *
   * For example, data fetched from other sources can be added to the entity, if
   * this is set up as a DTO.
   *
   * @todo Proper support for result DTOs should be added later on: this
   * function should then return a `Promise<ResultDTO>` instead.
   */
  async extendCreateResult(entity: Entity, createModel: CreateModel, info?: Info): Promise<Entity> {
    return entity;
  }

  async create(createModel: CreateModel, info?: Info): Promise<Entity> {
    this.logger.debug(`Creating ${this.alias}`);

    await this.validateBeforeCreate(createModel, info);
    const model = await this.setDataCreate(createModel, info);

    return new Promise((resolve, reject) => {
      this.repository
        .save(model)
        .then(async (result) => {
          const extendedResult = await this.extendCreateResult(result, createModel, info);
          if (this.actionAfterCreate)
            await this.actionAfterCreate(extendedResult, createModel, info);
          resolve(extendedResult);
        })
        .catch((e) => reject(e));
    });
  }
  // ↑↑↑ create

  // ↓↓↓ update
  async validateBeforeUpdate(id: string, updateModel: UpdateModel, info?: Info): Promise<void> {
    return;
  }

  async setFiltersUpdate(
    query: SelectQueryBuilder<Entity>,
    info?: Info,
  ): Promise<SelectQueryBuilder<Entity>> {
    return query;
  }

  async actionBeforeUpdate(id: string, updateModel: UpdateModel, info?: Info): Promise<void> {
    return;
  }

  async actionAfterUpdate(model: Entity, updateModel: UpdateModel, info?: Info): Promise<void> {
    return;
  }

  /**
   * At this stage, the results fetched from db can be further reshaped or
   * extended.
   *
   * For example, data fetched from other sources can be added to the entity, if
   * this is set up as a DTO.
   *
   * @todo Proper support for result DTOs should be added later on: this
   * function should then return a `Promise<ResultDTO>` instead.
   */
  async extendUpdateResult(entity: Entity, updateModel: UpdateModel, info?: Info): Promise<Entity> {
    return entity;
  }

  async update(id: string, updateModel: UpdateModel, info?: Info): Promise<Entity> {
    this.logger.debug(`Updating ${this.alias}`);
    await this.actionBeforeUpdate(id, updateModel, info);
    await this.validateBeforeUpdate(id, updateModel, info);
    let query = this.repository.createQueryBuilder(this.alias);
    query = await this.setFiltersUpdate(query, info);
    query.andWhere(`${this.alias}.${this.options.idProperty} = :id`).setParameter('id', id);
    let model = await query.getOne();
    if (!model) {
      throw new NotFoundException(`${this.alias} not found.`);
    }
    model = await this.setDataUpdate(model, updateModel, info);
    return new Promise((resolve, reject) => {
      this.repository
        .save(model)
        .then(async (result) => {
          const extendedResult = await this.extendUpdateResult(result, updateModel, info);
          if (this.actionAfterUpdate)
            await this.actionAfterUpdate(extendedResult, updateModel, info);
          resolve(extendedResult);
        })
        .catch((e) => reject(e));
    });
  }
  // ↑↑↑ update

  // ↓↓↓ delete
  async setFiltersDelete(
    query: SelectQueryBuilder<Entity>,
    info?: Info,
  ): Promise<SelectQueryBuilder<Entity>> {
    return query;
  }

  async canBeRemoved(id: string, model: Entity, info?: Info): Promise<boolean> {
    return true;
  }

  async remove(id: string, info?: Info): Promise<void> {
    this.logger.debug(`Removing a ${this.alias}`);
    let query = this.repository.createQueryBuilder(this.alias);
    query = await this.setFiltersDelete(query, info);
    query.andWhere(`${this.alias}.${this.options.idProperty} = :id`).setParameter('id', id);
    const model = await query.getOne();
    if (!model) {
      throw new NotFoundException(`${this.alias} not found.`);
    }
    if (await this.canBeRemoved(id, model, info)) {
      await this.repository.remove(model);
    } else {
      throw new ForbiddenException(`No suitable permissions to delete this ${this.alias}.`);
    }
  }

  async removeMany(idList: string[], info?: Info): Promise<void> {
    this.logger.debug(`Removing multiple ${this.alias}`);
    const query = this.repository
      .createQueryBuilder(this.alias)
      .where(`${this.alias}.${this.options.idProperty} IN (:...idList)`, { idList });
    const foundRecords = await query.getMany();
    if (foundRecords && foundRecords.length) {
      await this.repository.remove(foundRecords);
    }
  }
  // ↑↑↑ delete
}
