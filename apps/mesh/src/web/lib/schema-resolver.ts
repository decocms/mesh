/**
 * SchemaResolver — Layer 1 of the Studio Forms system.
 *
 * Consumes the raw `_meta` JSON from a deco site and resolves JSON Schema
 * definitions into flat, renderable FieldDescriptor trees. Handles $ref chains,
 * allOf merging, anyOf unions, and deco-specific extensions like `format` and
 * `titleBy`.
 *
 * Only supports the JSON Schema subset emitted by deco's TS→JSON Schema
 * compiler — not arbitrary JSON Schema.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FieldType =
  | "string"
  | "number"
  | "boolean"
  | "object"
  | "array"
  | "union"
  | "unknown";

export interface FieldDescriptor {
  key: string;
  type: FieldType;
  nullable: boolean;
  title: string;
  description?: string;
  format?: string;
  required: boolean;
  enumValues?: string[];
  defaultValue?: unknown;
  properties?: FieldDescriptor[];
  itemDescriptor?: FieldDescriptor;
  titleBy?: string;
  variants?: VariantDescriptor[];
}

export interface VariantDescriptor {
  resolveType: string;
  title: string;
  schema: FieldDescriptor;
}

export interface SectionInfo {
  resolveType: string;
  title: string;
  namespace: string;
}

export interface SiteMeta {
  major?: number;
  version?: string;
  namespace?: string;
  site?: string;
  manifest?: {
    blocks?: Record<
      string,
      Record<string, { $ref?: string; namespace?: string }>
    >;
  };
  schema?: {
    definitions?: Record<string, JSONSchemaNode>;
    root?: Record<
      string,
      { title?: string; anyOf?: Array<{ $ref?: string; [k: string]: unknown }> }
    >;
  };
}

export interface JSONSchemaNode {
  type?: string | string[];
  title?: string;
  description?: string;
  format?: string;
  properties?: Record<string, JSONSchemaNode>;
  required?: string[];
  items?: JSONSchemaNode;
  $ref?: string;
  allOf?: JSONSchemaNode[];
  anyOf?: JSONSchemaNode[];
  oneOf?: JSONSchemaNode[];
  enum?: unknown[];
  default?: unknown;
  titleBy?: string;
  additionalProperties?: boolean | JSONSchemaNode;
  not?: JSONSchemaNode;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REF_PREFIX = "#/definitions/";
const MAX_DEPTH = 10;

function extractRefKey(ref: string): string | null {
  if (ref.startsWith(REF_PREFIX)) {
    return ref.slice(REF_PREFIX.length);
  }
  return null;
}

function humanizeKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

function parseType(schemaType: string | string[] | undefined): {
  type: FieldType;
  nullable: boolean;
} {
  if (!schemaType) return { type: "unknown", nullable: false };

  if (Array.isArray(schemaType)) {
    const filtered = schemaType.filter((t) => t !== "null");
    const nullable = schemaType.includes("null");
    const primary = filtered[0] ?? "unknown";
    return { type: mapPrimitive(primary), nullable };
  }

  return { type: mapPrimitive(schemaType), nullable: false };
}

function mapPrimitive(t: string): FieldType {
  switch (t) {
    case "string":
      return "string";
    case "number":
    case "integer":
      return "number";
    case "boolean":
      return "boolean";
    case "object":
      return "object";
    case "array":
      return "array";
    default:
      return "unknown";
  }
}

function formatSectionTitle(resolveType: string): string {
  const parts = resolveType.split("/");
  const fileName = parts[parts.length - 1] ?? resolveType;
  return fileName.replace(/\.tsx?$/, "");
}

// ---------------------------------------------------------------------------
// SchemaResolver
// ---------------------------------------------------------------------------

type RootSchema = Record<
  string,
  { title?: string; anyOf?: Array<{ $ref?: string; [k: string]: unknown }> }
>;

export class SchemaResolver {
  private definitions: Record<string, JSONSchemaNode>;
  private manifest: SiteMeta["manifest"];
  private root: RootSchema;
  private resolvedCache = new Map<string, FieldDescriptor>();

  constructor(meta: SiteMeta) {
    this.definitions = meta.schema?.definitions ?? {};
    this.manifest = meta.manifest;
    this.root = (meta.schema?.root ?? {}) as RootSchema;
  }

  /**
   * List available sections from schema.root.sections.anyOf.
   */
  listSections(): SectionInfo[] {
    const sectionsRoot = this.root?.sections;
    if (!sectionsRoot?.anyOf) return [];

    const manifestSections = this.manifest?.blocks?.sections ?? {};

    return sectionsRoot.anyOf
      .map((entry) => {
        const refKey = entry.$ref ? extractRefKey(entry.$ref) : null;
        if (!refKey || refKey === "Resolvable") return null;

        const def = this.definitions[refKey];
        const resolveType = def?.properties?.__resolveType?.enum?.[0] as
          | string
          | undefined;
        if (!resolveType) return null;

        const namespace = manifestSections[resolveType]?.namespace ?? "unknown";

        return {
          resolveType,
          title: formatSectionTitle(resolveType),
          namespace,
        };
      })
      .filter((s): s is SectionInfo => s !== null);
  }

  /**
   * Resolve the full field descriptor tree for a section by its __resolveType.
   */
  resolveSection(resolveType: string): FieldDescriptor | null {
    const cached = this.resolvedCache.get(resolveType);
    if (cached) return cached;

    const key = btoa(resolveType);
    const wrapperSchema = this.definitions[key];
    if (!wrapperSchema) return null;

    const merged = this.mergeAllOf(wrapperSchema, new Set(), 0);
    if (!merged) return null;

    const descriptor = this.schemaToDescriptor(
      resolveType,
      merged,
      merged.required ?? [],
      new Set(),
      0,
    );

    // Remove the __resolveType field from properties — it's internal
    if (descriptor.properties) {
      descriptor.properties = descriptor.properties.filter(
        (p) => p.key !== "__resolveType",
      );
    }

    this.resolvedCache.set(resolveType, descriptor);
    return descriptor;
  }

  /**
   * Resolve a section with decofile fallback for saved blocks.
   *
   * When a section's __resolveType is a saved block name (e.g. "Footer"),
   * it won't exist in definitions. This method looks it up in the decofile
   * to find the actual component resolveType.
   */
  resolveSectionWithDecofile(
    resolveType: string,
    decofile: Record<string, Record<string, unknown>> | null,
  ): FieldDescriptor | null {
    const direct = this.resolveSection(resolveType);
    if (direct) return direct;

    if (!decofile) return null;

    const savedBlock = decofile[resolveType];
    if (!savedBlock?.__resolveType) return null;

    const realResolveType = savedBlock.__resolveType as string;
    return this.resolveSection(realResolveType);
  }

  /**
   * Look up a raw definition by key (escape hatch).
   */
  getDefinition(key: string): JSONSchemaNode | undefined {
    return this.definitions[key];
  }

  // -------------------------------------------------------------------------
  // Internal resolution
  // -------------------------------------------------------------------------

  private resolveRef(
    schema: JSONSchemaNode,
    visited: Set<string>,
    depth: number,
  ): JSONSchemaNode | null {
    if (depth > MAX_DEPTH) return null;

    if (schema.$ref) {
      const refKey = extractRefKey(schema.$ref);
      if (!refKey || visited.has(refKey)) return null;

      const resolved = this.definitions[refKey];
      if (!resolved) return null;

      visited.add(refKey);
      return this.resolveRef(resolved, visited, depth + 1);
    }

    return schema;
  }

  private mergeAllOf(
    schema: JSONSchemaNode,
    visited: Set<string>,
    depth: number,
  ): JSONSchemaNode | null {
    if (depth > MAX_DEPTH) return null;

    let resolved = this.resolveRef(schema, new Set(visited), depth);
    if (!resolved) return null;

    if (!resolved.allOf?.length) return resolved;

    // Merge all allOf entries into a single schema
    const merged: JSONSchemaNode = {
      type: resolved.type ?? "object",
      title: resolved.title,
      description: resolved.description,
      properties: { ...(resolved.properties ?? {}) },
      required: [...(resolved.required ?? [])],
    };

    for (const subSchema of resolved.allOf) {
      const sub = subSchema.$ref
        ? this.resolveRef(subSchema, new Set(visited), depth + 1)
        : subSchema;
      if (!sub) continue;

      const expanded = this.mergeAllOf(sub, visited, depth + 1);
      if (!expanded) continue;

      if (expanded.properties) {
        merged.properties = { ...merged.properties, ...expanded.properties };
      }
      if (expanded.required) {
        merged.required = [
          ...new Set([...(merged.required ?? []), ...expanded.required]),
        ];
      }
    }

    return merged;
  }

  private schemaToDescriptor(
    key: string,
    schema: JSONSchemaNode,
    parentRequired: string[],
    visited: Set<string>,
    depth: number,
  ): FieldDescriptor {
    if (depth > MAX_DEPTH) {
      return {
        key,
        type: "unknown",
        nullable: false,
        title: humanizeKey(key),
        required: false,
      };
    }

    // Resolve $ref first
    let resolved = schema;
    if (schema.$ref) {
      const refKey = extractRefKey(schema.$ref);
      if (refKey && !visited.has(refKey)) {
        visited.add(refKey);
        const def = this.definitions[refKey];
        if (def) {
          resolved = def;
        }
      }
    }

    // Merge allOf if present
    if (resolved.allOf?.length) {
      const merged = this.mergeAllOf(resolved, new Set(visited), depth);
      if (merged) resolved = merged;
    }

    // Handle anyOf → union type
    if (resolved.anyOf?.length) {
      return this.buildUnionDescriptor(
        key,
        resolved,
        parentRequired,
        visited,
        depth,
      );
    }

    const { type, nullable } = parseType(resolved.type);
    const isRequired = parentRequired.includes(key);

    const base: FieldDescriptor = {
      key,
      type,
      nullable,
      title: resolved.title ?? humanizeKey(key),
      description: resolved.description,
      format: resolved.format,
      required: isRequired,
      enumValues: resolved.enum?.map(String),
      defaultValue: resolved.default,
      titleBy: resolved.titleBy,
    };

    if (type === "object" && resolved.properties) {
      base.properties = Object.entries(resolved.properties).map(
        ([propKey, propSchema]) =>
          this.schemaToDescriptor(
            propKey,
            propSchema,
            resolved.required ?? [],
            new Set(visited),
            depth + 1,
          ),
      );
    }

    if (type === "array" && resolved.items) {
      base.itemDescriptor = this.schemaToDescriptor(
        "item",
        resolved.items,
        [],
        new Set(visited),
        depth + 1,
      );
    }

    return base;
  }

  private buildUnionDescriptor(
    key: string,
    schema: JSONSchemaNode,
    parentRequired: string[],
    visited: Set<string>,
    depth: number,
  ): FieldDescriptor {
    const variants: VariantDescriptor[] = [];

    for (const option of schema.anyOf ?? []) {
      const refKey = option.$ref ? extractRefKey(option.$ref) : null;

      // Skip the Resolvable option for now
      if (refKey === "Resolvable") continue;

      let optionSchema = option;
      if (refKey && this.definitions[refKey]) {
        optionSchema = this.definitions[refKey];
      }

      // Merge allOf in the variant
      const merged = this.mergeAllOf(optionSchema, new Set(visited), depth + 1);
      if (!merged) continue;

      const resolveType =
        (merged.properties?.__resolveType?.enum?.[0] as string) ??
        merged.title ??
        refKey ??
        "unknown";

      const variantDescriptor = this.schemaToDescriptor(
        resolveType,
        merged,
        [],
        new Set(visited),
        depth + 1,
      );

      // Remove __resolveType from variant properties
      if (variantDescriptor.properties) {
        variantDescriptor.properties = variantDescriptor.properties.filter(
          (p) => p.key !== "__resolveType",
        );
      }

      variants.push({
        resolveType,
        title: formatSectionTitle(resolveType),
        schema: variantDescriptor,
      });
    }

    return {
      key,
      type: "union",
      nullable: false,
      title: schema.title ?? humanizeKey(key),
      description: schema.description,
      required: parentRequired.includes(key),
      variants,
    };
  }
}

// ---------------------------------------------------------------------------
// Section unwrapping helpers
// ---------------------------------------------------------------------------

const LAZY_SUFFIX = "Rendering/Lazy.tsx";
const SINGLE_DEFERRED_SUFFIX = "Rendering/SingleDeferred.tsx";

export interface UnwrappedSection {
  resolveType: string;
  isLazy: boolean;
}

/**
 * Unwrap a section's data to find the real resolveType, handling:
 * - Lazy/SingleDeferred wrappers (unwrap to inner `section.__resolveType`)
 * - Saved blocks (look up in decofile to find the real component path)
 */
export function unwrapSection(
  sectionData: { __resolveType: string; [k: string]: unknown },
  decofile: Record<string, Record<string, unknown>> | null,
): UnwrappedSection {
  const rt = sectionData.__resolveType;

  const isLazy =
    rt.endsWith(LAZY_SUFFIX) || rt.endsWith(SINGLE_DEFERRED_SUFFIX);

  if (isLazy) {
    const inner = sectionData.section as
      | { __resolveType: string; [k: string]: unknown }
      | undefined;

    if (!inner?.__resolveType) {
      return { resolveType: rt, isLazy: true };
    }

    const innerResolved = resolveBlockName(inner.__resolveType, decofile);
    return { resolveType: innerResolved, isLazy: true };
  }

  return { resolveType: resolveBlockName(rt, decofile), isLazy: false };
}

/**
 * If a resolveType looks like a saved block name (no "/" in it),
 * look it up in the decofile to get the actual component path.
 */
function resolveBlockName(
  resolveType: string,
  decofile: Record<string, Record<string, unknown>> | null,
): string {
  if (resolveType.includes("/")) return resolveType;
  if (!decofile) return resolveType;

  const block = decofile[resolveType];
  if (block?.__resolveType && typeof block.__resolveType === "string") {
    return block.__resolveType as string;
  }

  return resolveType;
}
