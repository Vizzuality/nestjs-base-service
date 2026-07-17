import { DynamicModule, Module, Provider } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';

import { ZodValidationPipe } from './zod-validation.pipe';

/** Which DTO-validation strategy the library wires at module registration. */
export type BaseServiceValidation = 'class-validator' | 'zod';

export interface BaseServiceModuleOptions {
  /**
   * Validation strategy.
   *
   * - `'class-validator'` (default) — a **no-op**: no pipe is wired, exactly as
   *   before. DTO validation stays delegated to the host app's own
   *   `class-validator` setup (or the `validateBefore*` hooks).
   * - `'zod'` — registers {@link ZodValidationPipe} as a global pipe (`APP_PIPE`),
   *   so any Zod-backed DTO (from this library's `createZodDto`, or from
   *   `nestjs-zod` for auto-Swagger) is validated automatically.
   */
  validation?: BaseServiceValidation;
}

/**
 * Optional module to opt into library-provided validation wiring. Importing it is
 * NOT required to use `BaseService`; it exists so an API can select a validation
 * strategy in one place.
 *
 * ```ts
 * BaseServiceModule.forRoot({ validation: 'zod' });
 * ```
 *
 * The default (`'class-validator'`) is a no-op over today's behaviour, so existing
 * consumers are unaffected. `nestjs-zod` is an OPTIONAL peer — only needed if you
 * want Swagger generated from your Zod schemas; the built-in `ZodValidationPipe`
 * works without it.
 */
@Module({})
export class BaseServiceModule {
  static forRoot(options: BaseServiceModuleOptions = {}): DynamicModule {
    const validation = options.validation ?? 'class-validator';

    const providers: Provider[] =
      validation === 'zod' ? [{ provide: APP_PIPE, useClass: ZodValidationPipe }] : [];

    return {
      module: BaseServiceModule,
      providers,
      exports: providers,
    };
  }
}
