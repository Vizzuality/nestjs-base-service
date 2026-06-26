import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { pickBy } from '../utils/object.utils';
import { FetchSpecification } from '../types/fetch-specification.interface';
import { ProcessFetchSpecificationArguments } from '../types/process-fetch-specification.arguments';
import {
  DEFAULT_FIELDS_AND_INCLUDE_SPECIFICATION,
  DEFAULT_PAGINATION,
  DEFAULT_SORT_SPECIFICATION,
} from '../config/default.config';

// Re-exported so the package root API is unchanged; the interface itself lives
// in a pure, runtime-free module (`../types/process-fetch-specification.arguments`)
// so it can be shared with the types-only companion package.
export type { ProcessFetchSpecificationArguments } from '../types/process-fetch-specification.arguments';

/**
 * Parameter decorator: extracts `fetchSpecification` from request object.
 */
export const ProcessFetchSpecification = createParamDecorator(
  (
    processFetchSpecificationArgs: ProcessFetchSpecificationArguments = {},
    ctx: ExecutionContext,
  ) => {
    const request = ctx.switchToHttp().getRequest();

    const fetchSpecification: FetchSpecification = {
      ...DEFAULT_PAGINATION,
      ...DEFAULT_FIELDS_AND_INCLUDE_SPECIFICATION,
      ...DEFAULT_SORT_SPECIFICATION,
      ...request.query,
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
      typeof request?.query?.disablePagination === 'string'
        ? request?.query?.disablePagination.toLowerCase() === 'true'
        : typeof request?.query?.disablePagination === 'boolean'
          ? request?.query?.disablePagination
          : undefined;

    const pageSize = Number.parseInt(request?.query?.page?.size, 10);
    fetchSpecification.pageSize =
      typeof pageSize === 'number' && pageSize > 0 ? pageSize : undefined;

    const pageNumber = Number.parseInt(request?.query?.page?.number, 10);
    fetchSpecification.pageNumber =
      typeof pageNumber === 'number' && pageNumber > 0 ? pageNumber : undefined;

    fetchSpecification.fields = request?.query?.fields?.split(',');
    fetchSpecification.omitFields = request?.query?.omitFields?.split(',');
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
    fetchSpecification.include = request?.query?.include?.split(',');

    fetchSpecification.sort = request?.query?.sort?.split(',');

    /**
     * @debt Correctly parse filter values that contain url-encoded comma (`,`)
     * characters. Right now we read filter keys and values from the parsed
     * query (`req.query`), at which point occurrences of the `%2C` sequence
     * have already been decoded to `,`.
     * @debt Also add proper typing. This should start at Object.entries<T>
     */
    fetchSpecification.filter = request?.query?.filter
      ? Object.entries<string>(request?.query?.filter).reduce((acc, current) => {
          acc[current[0]] = current[1]?.split(',').filter((i) => i);
          return acc;
        }, {})
      : undefined;

    /**
     * Partial-match search terms. Unlike `filter` (exact match, comma-split into
     * arrays), each `search[<property>]` value is kept as a single literal
     * string and later applied as a case-insensitive `ILIKE '%term%'`. Empty
     * terms are dropped so we never emit a match-everything `ILIKE '%%'`.
     */
    fetchSpecification.search = request?.query?.search
      ? Object.entries<unknown>(request?.query?.search).reduce((acc, [key, value]) => {
          const term = value == null ? '' : String(value);
          if (term.length > 0) {
            acc[key] = term;
          }
          return acc;
        }, {})
      : undefined;

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
    delete request?.query?.fields;
    delete request?.query?.omitFields;
    delete request?.query?.page;
    delete request?.query?.sort;
    delete request?.query?.include;
    delete request?.query?.disablePagination;
    delete request?.query?.search;

    if (!request.fetchSpecification) {
      request.fetchSpecification = {};
    }

    request.fetchSpecification = fetchSpecification;

    if (processFetchSpecificationArgs?.allowedFilters) {
      const result = pickBy(request.fetchSpecification.filter, function (value, key) {
        if (processFetchSpecificationArgs.allowedFilters.includes(key)) {
          return true;
        } else {
          throw new Error(`Invalid filter key: ${key}`);
        }
      });

      if (Object.keys(result).length > 0) {
        request.fetchSpecification.filter = result;
      }
    }

    if (processFetchSpecificationArgs?.allowedSearch) {
      const result = pickBy(request.fetchSpecification.search, function (value, key) {
        if (processFetchSpecificationArgs.allowedSearch.includes(key)) {
          return true;
        } else {
          throw new Error(`Invalid search key: ${key}`);
        }
      });

      if (Object.keys(result).length > 0) {
        request.fetchSpecification.search = result;
      }
    }

    return request.fetchSpecification;
  },
);
