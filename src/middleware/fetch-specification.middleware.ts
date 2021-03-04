import { NestMiddleware, Injectable, Logger } from '@nestjs/common';
import { DEFAULT_PAGINATION } from '../config/default.config';
import { parseInt } from 'lodash';
import { FetchSpecification } from 'types/fetch-specification.interface';

const defaultFetchSpec = {
  fields: [],
  includes: [],
  sort: [],
};

/* eslint-disable @typescript-eslint/no-unused-vars */
class ConfigPagination {
  includes?: string[] = [];
  allowIncludes?: string[] = [];
}

/**
 * The job of FetchSpecificationMiddleware is to reflect fetch specification
 * metadata (provided as query params) into the request object.
 */
@Injectable()
export class FetchSpecificationMiddleware implements NestMiddleware {
  use(req: any, _res: any, next: () => void): any {
    Logger.debug('Reflecting fetch specification metadata from query params to request object');
    const fetchSpecification: FetchSpecification = {
      ...DEFAULT_PAGINATION,
      ...defaultFetchSpec,
      ...req.query,
    };

    /**
     * If desired, pagination can be disabled for a request by using the
     * `?disablePagination=true` flag in the request query.
     */
    fetchSpecification.disablePagination = req?.query?.disablePagination?.toLowerCase() === 'true';

    const pageSize = parseInt(req?.query?.page?.size);
    fetchSpecification.pageSize =
      typeof pageSize === 'number' && pageSize > 0 ? pageSize : undefined;

    const pageNumber = parseInt(req?.query?.page?.number);
    fetchSpecification.pageNumber =
      typeof pageNumber === 'number' && pageNumber > 0 ? pageNumber : undefined;

    fetchSpecification.fields = req?.query?.fields?.split(',');
    fetchSpecification.omitFields = req?.query?.omitFields?.split(',');
    /**
     * @todo Most entities will use `id` as unique id, but since some do not,
     * this will not work. We need to make this configurable in this middleware,
     * with fallback to `id` if no custom key is provided.
     */
    // if (fetchSpecification.fields?.indexOf('id') < 0) {
    //  fetchSpecification.fields.push('id');
    // }

    /**
     * @todo Possibly reinstate whitelisting of allowed includes, e.g.
     * (...).filter(inc => prePagination.allowIncludes.indexOf(inc) >= 0);
     */
    fetchSpecification.includes = req?.query?.includes?.split(',');

    /**
     * @debt We are already interpreting `+` and `-` prefixes in
     * `FetchUtils`, so doing it here must be removed - we can pass the sort
     * param values as they are to `FetchUtils.processFetchSpecification()`.
     */
    fetchSpecification.sort = req?.query?.sort?.split(',').map((stat: string) => {
      if (stat.startsWith('-')) {
        return { column: stat.slice(1, stat.length), order: 'DESC' };
      }
      if (stat.startsWith('+')) {
        return { column: stat.slice(1, stat.length), order: 'ASC' };
      }
      return { column: stat, order: 'ASC' };
    });

    /**
     * Delete from the request object's query property all the query params we
     * process in this middleware, since we are passing them on as
     * `req.fetchSpecification` and they are not needed anymore in their
     * original format.
     *
     * Moreover, if we left these query params in the query object any query
     * validation pipe which may use whitelisting of properties and forbid
     * non-whitelisted properties would throw an error.
     *
     * E.g. `app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true });`
     */
    delete req?.query?.fields;
    delete req?.query?.omitFields;
    delete req?.query?.page;
    delete req?.query?.sort;
    delete req?.query?.includes;
    delete req?.query?.disablePagination;

    if (!req.fetchSpecification) {
      req.fetchSpecification = {};
    }

    req.fetchSpecification = fetchSpecification;
    next();
  }
}
