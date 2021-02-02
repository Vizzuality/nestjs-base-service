import { createParamDecorator } from '@nestjs/common';
import { Request } from 'express';

export const Pagination = createParamDecorator((_data, req: Request) => {
  return req['pagination'];
});
