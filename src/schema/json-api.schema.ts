import { z } from 'zod';

/**
 * Runtime (Zod) counterparts of the JSON:API error type aliases in the types
 * companion package (`JsonApiErrorObject` / `JsonApiErrorDocument`). Kept here
 * (not in the types package) because they carry a `zod` runtime; the pure type
 * aliases stay dependency-free over there.
 *
 * These schemas are exercised at runtime by `test/schema/json-api.schema.spec.ts`
 * (a compile-time `z.infer` assignment guard would be vacuous under this repo's
 * `strict: false` tsconfig, so the parity is checked by tests instead).
 */
export const jsonApiErrorObjectSchema = z.object({
  status: z.string().optional(),
  // Application-specific error code (JSON:API first-class member). The stable
  // key the client branches on to translate and render the message.
  code: z.string().optional(),
  title: z.string().optional(),
  detail: z.string().optional(),
  source: z
    .object({
      pointer: z.string().optional(),
      parameter: z.string().optional(),
    })
    .optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export const jsonApiErrorDocumentSchema = z.object({
  errors: z.array(jsonApiErrorObjectSchema),
});
