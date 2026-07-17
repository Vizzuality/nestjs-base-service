import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

/**
 * Minimal structural view of a Zod schema — enough to validate without importing
 * `zod` into this (NestJS) package. The schema itself comes from the consumer's
 * `zod` instance (via the schema package's `buildFetchQuerySchema`), so the
 * runtime package never needs `zod` as a dependency.
 */
export interface ZodLikeSchema {
  // Modelled with optional fields (rather than a discriminated union) so it
  // narrows cleanly under this repo's non-strict tsconfig.
  safeParse(value: unknown): ZodLikeResult;
}

interface ZodLikeResult {
  success: boolean;
  data?: unknown;
  error?: { issues: Array<{ path: Array<string | number>; message: string; code?: string }> };
}

// A DTO class carrying a Zod schema. Both the library's `createZodDto` fallback
// (`zodSchema`) and `nestjs-zod`'s `createZodDto` (`schema`) are recognised, so a
// single pipe validates either.
type ZodDtoClass = { zodSchema?: ZodLikeSchema; schema?: ZodLikeSchema };

function schemaOf(metatype: unknown): ZodLikeSchema | undefined {
  const candidate = metatype as ZodDtoClass | undefined;
  const schema = candidate?.zodSchema ?? candidate?.schema;
  return schema && typeof schema.safeParse === 'function' ? schema : undefined;
}

/**
 * A thin, dependency-free Zod validation pipe. If the argument's metatype is a
 * Zod-backed DTO (from `createZodDto` here, or from `nestjs-zod`), the value is
 * `safeParse`d and, on failure, a `BadRequestException` carrying the Zod issues
 * is thrown. Non-Zod arguments pass through untouched.
 *
 * Registered globally by `BaseServiceModule.forRoot({ validation: 'zod' })`; can
 * also be applied per-route (`@UsePipes(ZodValidationPipe)`).
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    const schema = schemaOf(metadata?.metatype);
    if (!schema) {
      return value;
    }
    const result = schema.safeParse(value);
    if (result.success) {
      return result.data;
    }
    throw new BadRequestException({
      message: 'Validation failed',
      issues: result.error?.issues ?? [],
    });
  }
}

/**
 * Wrap a Zod schema (e.g. the output of `buildFetchQuerySchema`) into a NestJS
 * DTO class that `ZodValidationPipe` validates. Use this when you are NOT using
 * `nestjs-zod`.
 *
 * For automatic Swagger/OpenAPI generation from the Zod schema, use
 * `nestjs-zod`'s own `createZodDto` instead — `ZodValidationPipe` recognises those
 * DTOs too (it reads their static `schema`).
 */
export function createZodDto(schema: ZodLikeSchema): { new (): unknown; zodSchema: ZodLikeSchema } {
  class ZodDto {
    static zodSchema = schema;
  }
  return ZodDto;
}
