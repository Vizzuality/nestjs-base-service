import { NestMiddleware, Injectable, Logger } from '@nestjs/common';
import {
  DEFAULT_FIELDS_AND_INCLUDE_SPECIFICATION,
  DEFAULT_PAGINATION,
  DEFAULT_SORT_SPECIFICATION,
} from '../config/default.config';
import { parseInt } from 'lodash';
import { FetchSpecification } from 'types/fetch-specification.interface';

/**
 * The job of FetchSpecificationMiddleware is to reflect fetch specification
 * metadata (provided as query params) into the request object.
 */
@Injectable()
export class FetchSpecificationMiddleware implements NestMiddleware {
  use(req: any, _res: any, next: () => void): any {
    const fetchSpecification: FetchSpecification = {
      ...DEFAULT_PAGINATION,
      ...DEFAULT_FIELDS_AND_INCLUDE_SPECIFICATION,
      ...DEFAULT_SORT_SPECIFICATION,
      ...req.query,
    };

    /**
     * If desired, pagination can be disabled for a request by using the
     * `?disablePagination=true` flag in the request query.
     *
     * @debt If downstream is using a boolean parse pipe, this value may be a
     * boolean, otherwise it would be a plain string. I think we should handle
     * this more robustly. Here we discard anything which is not a string or a
     * boolean, which I think *is* correct, but this seems also the perfect
     * scenario where complementing (non-)working neurons with property based
     * testing may make sense.
     */
    fetchSpecification.disablePagination =
      typeof req?.query?.disablePagination === 'string'
        ? req?.query?.disablePagination.toLowerCase() === 'true'
        : typeof req?.query?.disablePagination === 'boolean'
        ? req?.query?.disablePagination
        : undefined;

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
     * @todo Possibly reinstate whitelisting of allowed included entities, e.g.
     * (...).filter(inc => prePagination.allowIncludes.indexOf(inc) >= 0);
     */
    fetchSpecification.include = req?.query?.include?.split(',');

    fetchSpecification.sort = req?.query?.sort?.split(',');

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
    delete req?.query?.include;
    delete req?.query?.disablePagination;

    if (!req.fetchSpecification) {
      req.fetchSpecification = {};
    }

    req.fetchSpecification = fetchSpecification;
    next();
  }
}
