import type { FetchSpecification } from './fetch-specification.interface';

/**
 * The over-the-wire shape of a fetch query as validated on the API boundary
 * (e.g. by a Zod DTO): identical to `FetchSpecification` except pagination is
 * nested under `page` (JSON:API-canonical `page[number]` / `page[size]`) rather
 * than the flat `pageNumber` / `pageSize` the service layer consumes.
 *
 * `BaseService.toFetchSpecification()` normalises this into a
 * `FetchSpecification` (see the pagination mapping + `ensureIdField`).
 */
export type WireFetchQuery = Omit<FetchSpecification, 'pageNumber' | 'pageSize'> & {
  page?: { number?: number; size?: number };
};
