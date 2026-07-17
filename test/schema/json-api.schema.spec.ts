import { describe, it, expect } from 'vitest';
import {
  jsonApiErrorDocumentSchema,
  jsonApiErrorObjectSchema,
} from '../../src/schema/json-api.schema';

// The error schemas are shipped public runtime (used to type contract error
// responses), so exercise them at runtime — a static z.infer assertion would be
// vacuous under this repo's non-strict tsconfig.

describe('jsonApiErrorObjectSchema', () => {
  it('accepts a fully-populated error object', () => {
    const parsed = jsonApiErrorObjectSchema.parse({
      status: '404',
      code: 'not_found',
      title: 'Not Found',
      detail: 'No such resource.',
      source: { pointer: '/data', parameter: 'id' },
      meta: { requestId: 'abc' },
    });
    expect(parsed.code).toBe('not_found');
    expect(parsed.source?.pointer).toBe('/data');
  });

  it('accepts an empty object (all members optional)', () => {
    expect(jsonApiErrorObjectSchema.safeParse({}).success).toBe(true);
  });

  it('rejects a non-string code', () => {
    expect(jsonApiErrorObjectSchema.safeParse({ code: 123 }).success).toBe(false);
  });

  it('rejects a malformed source (non-string pointer)', () => {
    expect(jsonApiErrorObjectSchema.safeParse({ source: { pointer: 5 } }).success).toBe(false);
  });
});

describe('jsonApiErrorDocumentSchema', () => {
  it('accepts a document with an errors array', () => {
    const parsed = jsonApiErrorDocumentSchema.parse({
      errors: [{ status: '400', code: 'invalid' }],
    });
    expect(parsed.errors).toHaveLength(1);
  });

  it('rejects a document missing the errors array', () => {
    expect(jsonApiErrorDocumentSchema.safeParse({}).success).toBe(false);
  });

  it('rejects errors that is not an array', () => {
    expect(jsonApiErrorDocumentSchema.safeParse({ errors: { status: '400' } }).success).toBe(false);
  });
});
