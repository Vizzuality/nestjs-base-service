import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Parameter decorator: extracts `fetchSpecification` from request object.
 */
export const ProcessFetchSpecification = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.fetchSpecification;
  }
);
