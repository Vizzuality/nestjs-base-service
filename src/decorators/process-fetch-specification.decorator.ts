import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { pickBy } from 'lodash';

/**
 * Parameter decorator: extracts `fetchSpecification` from request object.
 */
export const ProcessFetchSpecification = createParamDecorator(
  (allowedFilterArguments: string[], ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();

    if (allowedFilterArguments) {
      const result = pickBy(request.fetchSpecification.filter, function (value, key) {
        return allowedFilterArguments.includes(key);
      });

      request.fetchSpecification.filter = result;
    }

    return request.fetchSpecification;
  }
);
