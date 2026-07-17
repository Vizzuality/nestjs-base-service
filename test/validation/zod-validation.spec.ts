import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { z } from 'zod';
import { ZodValidationPipe, createZodDto } from '../../src/validation/zod-validation.pipe';
import { BaseServiceModule } from '../../src/validation/base-service.module';

const schema = z.object({ name: z.string(), age: z.coerce.number().optional() });

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe();
  const meta = (metatype: unknown) => ({ type: 'query' as const, metatype: metatype as never });

  it('passes non-Zod arguments through untouched', () => {
    const value = { anything: true };
    expect(pipe.transform(value, meta(Object))).toBe(value);
  });

  it('passes through a class whose `schema`/`zodSchema` is not a function', () => {
    class NotReallyADto {
      static schema = { notSafeParse: true };
      static zodSchema = 'nope';
    }
    const value = { anything: true };
    expect(pipe.transform(value, meta(NotReallyADto))).toBe(value);
  });

  it('passes through when metatype is undefined', () => {
    const value = { anything: true };
    expect(pipe.transform(value, { type: 'query', metatype: undefined as never })).toBe(value);
  });

  it('validates and returns parsed data for a library createZodDto', () => {
    const Dto = createZodDto(schema);
    expect(pipe.transform({ name: 'Ada', age: '42' }, meta(Dto))).toEqual({ name: 'Ada', age: 42 });
  });

  it('recognises a nestjs-zod-style DTO (static `schema`)', () => {
    class NestjsZodDto {
      static schema = schema;
    }
    expect(pipe.transform({ name: 'Ada' }, meta(NestjsZodDto))).toEqual({ name: 'Ada' });
  });

  it('throws BadRequestException with Zod issues on invalid input', () => {
    const Dto = createZodDto(schema);
    try {
      pipe.transform({ age: 'not-a-number' }, meta(Dto));
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      const response = (err as BadRequestException).getResponse() as {
        message: string;
        issues: unknown[];
      };
      expect(response.message).toBe('Validation failed');
      expect(response.issues.length).toBeGreaterThan(0);
    }
  });
});

describe('createZodDto', () => {
  it('attaches the schema as a static zodSchema', () => {
    const Dto = createZodDto(schema);
    expect(Dto.zodSchema).toBe(schema);
  });
});

describe('BaseServiceModule.forRoot', () => {
  it('is a no-op for the default (class-validator) strategy', () => {
    expect(BaseServiceModule.forRoot().providers).toEqual([]);
    expect(BaseServiceModule.forRoot({ validation: 'class-validator' }).providers).toEqual([]);
  });

  it("registers a global ZodValidationPipe for validation: 'zod'", () => {
    const dynamic = BaseServiceModule.forRoot({ validation: 'zod' });
    expect(dynamic.providers).toEqual([{ provide: APP_PIPE, useClass: ZodValidationPipe }]);
    expect(dynamic.module).toBe(BaseServiceModule);
  });

  it('throws (fail-fast) on an unknown validation strategy', () => {
    expect(() =>
      // @ts-expect-error — deliberately invalid value to exercise the runtime guard
      BaseServiceModule.forRoot({ validation: 'zodd' }),
    ).toThrowError(/unknown validation strategy 'zodd'/);
  });
});
