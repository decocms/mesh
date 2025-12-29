/**
 * Utilities for JSON Schema manipulation, ported from admin-cx
 */

import type { JSONSchema7 } from "json-schema";

type Schema = JSONSchema7 & { definitions?: Record<string, JSONSchema7> };

/**
 * Get value from object by path array
 */
export function get(obj: any, path: (string | number)[]): any {
  let current = obj;
  for (const key of path) {
    if (current == null) return undefined;
    current = current[key];
  }
  return current;
}

/**
 * Parse a JSON Schema $ref path into an array
 * e.g. "#/definitions/MyType" -> ["definitions", "MyType"]
 */
export function getRefPath(ref: string): string[] {
  return ref.split("/").slice(1);
}

/**
 * Dereference a JSON Schema $ref, following the chain until we find a non-ref schema
 */
export function deRef(itemsRef: string, schema: Schema): JSONSchema7 | undefined {
  const [dereferenced] = deRefReturnId(itemsRef, schema);
  return dereferenced;
}

/**
 * Dereference a JSON Schema $ref, returning both the dereferenced schema and the last ref ID
 */
export function deRefReturnId(
  itemsRef: string,
  schema: Schema
): [JSONSchema7 | undefined, string] {
  let localRefArr = getRefPath(itemsRef);
  let localSchema = get(schema, localRefArr) as JSONSchema7 | undefined;
  let maxDepth = 10;
  let lastRef = itemsRef;

  while (localSchema?.$ref && maxDepth > 0) {
    lastRef = localSchema.$ref;
    localRefArr = getRefPath(localSchema.$ref);
    localSchema = get(schema, localRefArr);
    maxDepth--;
  }

  return [localSchema, lastRef];
}

/**
 * Check if a value has a __resolveType property (used for loaders/blocks)
 */
export function hasResolveType(value: unknown): value is { __resolveType: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "__resolveType" in value &&
    typeof (value as any).__resolveType === "string"
  );
}

/**
 * Get the __resolveType from a schema's default value or enum
 */
export function getResolveTypeFromSchema(schema: JSONSchema7): string | undefined {
  const props = schema.properties;
  if (!props) return undefined;

  const resolveTypeSchema = props.__resolveType as JSONSchema7 | undefined;
  if (!resolveTypeSchema) return undefined;

  // Check for default value
  if (typeof resolveTypeSchema.default === "string") {
    return resolveTypeSchema.default;
  }

  // Check for const
  if (typeof resolveTypeSchema.const === "string") {
    return resolveTypeSchema.const;
  }

  // Check for enum with single value
  if (resolveTypeSchema.enum?.length === 1) {
    return String(resolveTypeSchema.enum[0]);
  }

  return undefined;
}

/**
 * Check if a schema represents a loader (has __resolveType pointing to loaders/)
 */
export function isLoaderSchema(schema: JSONSchema7): boolean {
  const resolveType = getResolveTypeFromSchema(schema);
  return resolveType?.includes("/loaders/") ?? false;
}

/**
 * Check if a schema represents a section
 */
export function isSectionSchema(schema: JSONSchema7): boolean {
  const resolveType = getResolveTypeFromSchema(schema);
  return resolveType?.includes("/sections/") ?? false;
}

/**
 * Map anyOf/oneOf options to a format suitable for SelectBlock
 */
export function mapOptionsToNativeOptions(
  opts: JSONSchema7[],
  rootSchema: Schema
): Array<{
  label: string;
  resolveType: string | undefined;
  schema: JSONSchema7 | undefined;
  value: number;
}> {
  return opts.map((opt, idx) => {
    if (opt.$ref) {
      const optSchema = get(rootSchema, getRefPath(opt.$ref)) as JSONSchema7;
      const resolveType = optSchema ? getResolveTypeFromSchema(optSchema) : undefined;
      return {
        label: resolveType ?? `Option ${idx + 1}`,
        resolveType,
        schema: optSchema,
        value: idx,
      };
    }

    return {
      label: opt.title ?? `Option ${idx + 1}`,
      value: idx,
      resolveType: undefined,
      schema: opt,
    };
  });
}

/**
 * Convert RJSF field id to object path
 * e.g. "root_sections_0_title" -> ["sections", "0", "title"]
 */
export function idToObjectPath(id: string): string[] {
  return id.split("_").slice(1);
}

/**
 * Beautify a schema title by extracting the last part and formatting
 */
export function beautifySchemaTitle(title: string | undefined): string {
  if (!title) return "";
  
  // Handle paths like "site/sections/Hero.tsx"
  const lastPart = title.split("/").pop() ?? title;
  
  // Remove file extension
  const withoutExt = lastPart.replace(/\.(tsx?|jsx?)$/, "");
  
  // Convert camelCase/PascalCase to spaces
  return withoutExt.replace(/([a-z])([A-Z])/g, "$1 $2");
}

/**
 * Check if this is a saved block reference (has a specific naming pattern)
 */
export function isSavedBlock(title: string): boolean {
  return title.startsWith("#") || title.includes("blocks/");
}

/**
 * Get saved block ID from a schema title
 */
export function getSavedBlockIdBySchemaTitle(title: string): string | undefined {
  if (!isSavedBlock(title)) return undefined;
  
  // Handle "#blocks/my-block" format
  if (title.startsWith("#")) {
    return title.slice(1);
  }
  
  return title;
}

