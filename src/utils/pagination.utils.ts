import { SelectQueryBuilder } from 'typeorm';
import { FetchSpecification } from '../types/fetch-specification.interface';

const logger = require('logger');

export class PaginationUtil<T> {
  static addIncludesFields<T>(
    query: SelectQueryBuilder<T>,
    aliasTable: string,
    { fields, includes, pageSize, pageNumber, sort }: FetchSpecification
  ) {
    if (fields && fields.length > 0) {
      query.select(fields.map((f) => `${aliasTable}.${f}`));
    }
    if (includes && includes.length > 0) {
      includes.forEach((inc) => {
        const parts = inc.split('.');
        let lastPart = null;
        let completed = '';
        if (parts.length > 1) {
          parts.forEach((element, index) => {
            if (index > 0) {
              completed += '.';
            }
            completed += element;
            const alias = completed.replace('.', '_');
            if (includes.indexOf(completed) === -1 || completed === inc) {
              if (index === 0) {
                query.leftJoinAndSelect(`${aliasTable}.${element}`, alias);
              } else {
                query.leftJoinAndSelect(`${lastPart}.${element}`, alias);
              }
            }

            lastPart = alias;
          });
        } else {
          query.leftJoinAndSelect(`${aliasTable}.${inc}`, inc);
        }
      });
    }
    return query;
  }
  static addPagination<T>(
    query: SelectQueryBuilder<T>,
    aliasTable: string,
    { fields, includes, pageSize, pageNumber, sort }: FetchSpecification
  ) {
    logger.debug('pagination', sort);
    if (fields && fields.length > 0) {
      query.select(fields.map((f) => `${aliasTable}.${f}`));
    }
    if (includes && includes.length > 0) {
      includes.forEach((inc) => {
        const parts = inc.split('.');
        let lastPart = null;
        let completed = '';
        if (parts.length > 1) {
          parts.forEach((element, index) => {
            if (index > 0) {
              completed += '.';
            }
            completed += element;
            const alias = completed.replace('.', '_');
            if (includes.indexOf(completed) === -1 || completed === inc) {
              if (index === 0) {
                query.leftJoinAndSelect(`${aliasTable}.${element}`, alias);
              } else {
                query.leftJoinAndSelect(`${lastPart}.${element}`, alias);
              }
            }

            lastPart = alias;
          });
        } else {
          query.leftJoinAndSelect(`${aliasTable}.${inc}`, inc);
        }
      });
    }
    if (sort) {
      sort.map((s) => {
        query.addOrderBy(`${aliasTable}.${s.column}`, s.order);
      });
    }
    query.take(pageSize);
    query.skip(pageSize * (pageNumber - 1));
    return query;
  }
}
