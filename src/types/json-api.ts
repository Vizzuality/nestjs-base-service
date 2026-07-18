/**
 * Generic, framework-free JSON:API document and error shapes.
 *
 * These are pure types (zero runtime) so they ship from the types-only companion
 * package and can be shared by clients, contracts and the API alike. The runtime
 * Zod counterparts of the error shapes live in the schema package
 * (`@vizzuality/base-service-schema`).
 *
 * They are declared as `type` aliases, NOT `interface`, on purpose. oRPC's
 * `JsonifiedValue<T>` (applied to every client output) only maps a type's
 * properties when `T extends Record<string, unknown>`. TS interfaces are not
 * assignable to that constraint (no implicit index signature, since declaration
 * merging could add members); type aliases for object literals are. Using
 * `interface` here makes a client infer query `data` as `unknown` and forces
 * casts at every call site.
 */

/** A single JSON:API resource object (`{ type, id, attributes }`). */
export type JsonApiResourceObject<TType extends string, TAttributes> = {
  type: TType;
  id: string;
  attributes?: Partial<TAttributes>;
};

/** A JSON:API document whose primary data is a single resource. */
export type JsonApiResource<TType extends string, TData extends { id: string }> = {
  data: JsonApiResourceObject<TType, Omit<TData, 'id'>>;
  meta?: Record<string, unknown>;
  links?: Record<string, string>;
  jsonapi?: { version: string };
};

/** A JSON:API document whose primary data is a collection of resources. */
export type JsonApiCollection<TType extends string, TData extends { id: string }> = {
  data: JsonApiResourceObject<TType, Omit<TData, 'id'>>[];
  meta?: Record<string, unknown>;
  links?: Record<string, string>;
  jsonapi?: { version: string };
};

/** Standard pagination `meta` for collection documents. */
export type JsonApiPaginationMeta = {
  totalItems: number;
  page: number;
  size: number;
};

/**
 * A data-less JSON:API document: only top-level `meta`. Used for outcomes that
 * are not a resource — an advisory verdict, or a "needs confirmation" answer.
 */
export type JsonApiMetaDocument<TMeta extends Record<string, unknown>> = {
  meta: TMeta;
  jsonapi?: { version: string };
};

/** A single JSON:API error object. */
export type JsonApiErrorObject = {
  status?: string;
  /**
   * Application-specific error code (JSON:API first-class member). The stable
   * key the client branches on to translate and render the message.
   */
  code?: string;
  title?: string;
  detail?: string;
  source?: {
    pointer?: string;
    parameter?: string;
  };
  meta?: Record<string, unknown>;
};

/** A JSON:API error document (`{ errors: [...] }`). */
export type JsonApiErrorDocument = {
  errors: JsonApiErrorObject[];
};
