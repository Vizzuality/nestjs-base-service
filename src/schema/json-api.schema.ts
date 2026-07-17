import { z } from 'zod';

import type { JsonApiErrorDocument, JsonApiErrorObject } from '../types/json-api';

/**
 * Runtime (Zod) counterparts of the JSON:API error type aliases in the types
 * companion package. Kept here (not in the types package) because they carry a
 * `zod` runtime; the pure type aliases stay dependency-free over there.
 *
 * The `satisfies` guards keep the inferred Zod output in lockstep with the
 * hand-written type aliases — if the two ever drift, this stops compiling.
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

// Compile-time assertions that the schemas and the type aliases agree.
const _errorObject: z.infer<typeof jsonApiErrorObjectSchema> = {} as JsonApiErrorObject;
const _errorDocument: z.infer<typeof jsonApiErrorDocumentSchema> = {} as JsonApiErrorDocument;
void _errorObject;
void _errorDocument;
