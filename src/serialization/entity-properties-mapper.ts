import { ModelPropertiesMapper } from 'jsona';
import type { DataSource, EntityMetadata } from 'typeorm';

/**
 * jsona properties mapper that resolves the JSON:API `type`, `id`, attributes
 * and relationships of TypeORM entity instances from the runtime entity
 * metadata of the active DataSource.
 *
 * It degrades gracefully for plain objects that no longer carry their class
 * identity (e.g. results reshaped by `omitFields`): such objects fall back to
 * the provided default type/id, with every own property treated as an
 * attribute and no relationships.
 */
export class EntityPropertiesMapper extends ModelPropertiesMapper {
  constructor(
    private readonly dataSource: DataSource | undefined,
    private readonly fallbackType: string,
    private readonly fallbackIdProperty: string,
  ) {
    super();
  }

  private metadataFor(model: unknown): EntityMetadata | undefined {
    const ctor = (model as { constructor?: unknown } | null)?.constructor;
    if (!this.dataSource || !ctor || ctor === Object) {
      return undefined;
    }
    try {
      return this.dataSource.getMetadata(ctor as Parameters<DataSource['getMetadata']>[0]);
    } catch {
      return undefined;
    }
  }

  private idPropertyFor(model: unknown): string {
    return this.metadataFor(model)?.primaryColumns?.[0]?.propertyName ?? this.fallbackIdProperty;
  }

  getId(model: Record<string, unknown>): string | number {
    return model[this.idPropertyFor(model)] as string | number;
  }

  getType(model: Record<string, unknown>): string {
    return this.metadataFor(model)?.name ?? this.fallbackType;
  }

  getAttributes(model: Record<string, unknown>): Record<string, unknown> {
    const metadata = this.metadataFor(model);
    const idProperty = this.idPropertyFor(model);
    const relationNames = new Set(metadata?.relations?.map((relation) => relation.propertyName));
    const attributes: Record<string, unknown> = {};
    for (const key of Object.keys(model)) {
      if (key === idProperty || relationNames.has(key)) {
        continue;
      }
      attributes[key] = model[key];
    }
    return attributes;
  }

  getRelationships(model: Record<string, unknown>): Record<string, unknown> {
    const metadata = this.metadataFor(model);
    if (!metadata) {
      return {};
    }
    const relationships: Record<string, unknown> = {};
    for (const relation of metadata.relations) {
      const value = model[relation.propertyName];
      if (value !== undefined && value !== null) {
        relationships[relation.propertyName] = value;
      }
    }
    return relationships;
  }
}
