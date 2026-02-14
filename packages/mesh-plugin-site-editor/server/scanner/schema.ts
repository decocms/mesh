/**
 * Schema - JSON Schema Generation from ts-morph Types
 *
 * Uses ts-json-schema-generator to convert TypeScript prop types into
 * JSON Schema 7. Feeds the ts-morph in-memory program to the generator
 * for seamless integration without filesystem access.
 *
 * Falls back to a permissive schema on failure -- complex types (conditional types,
 * template literals, deep utility types) may not be representable in JSON Schema.
 */

import type { Project } from "ts-morph";
import {
  SchemaGenerator,
  createParser,
  createFormatter,
  DEFAULT_CONFIG,
  type CompletedConfig,
} from "ts-json-schema-generator";
import type ts from "typescript";
import type { JSONSchema7 } from "./types.js";

/**
 * Permissive fallback schema used when generation fails.
 */
const FALLBACK_SCHEMA: JSONSchema7 = {
  type: "object",
  additionalProperties: true,
  description: "Schema could not be auto-generated. Edit manually or re-scan.",
};

/**
 * Generate a JSON Schema from a TypeScript type using ts-json-schema-generator.
 *
 * @param project - ts-morph Project with in-memory source files
 * @param typeName - The TypeScript type name (e.g., "HeroProps")
 * @param filePath - Source file path containing the type
 * @returns JSON Schema 7 for the type, or a permissive fallback on failure
 */
export function generateSchema(
  project: Project,
  typeName: string,
  filePath: string,
): JSONSchema7 {
  try {
    // Cast through unknown to bridge the TypeScript version mismatch between
    // ts-morph's bundled TS and ts-json-schema-generator's TS.
    // Both expose the same ts.Program interface but from different TS installations.
    const program = project.getProgram()
      .compilerObject as unknown as ts.Program;

    const config: CompletedConfig = {
      ...DEFAULT_CONFIG,
      path: filePath,
      type: typeName,
      expose: "none",
      jsDoc: "extended",
      skipTypeCheck: true,
      topRef: false,
      additionalProperties: false,
    };

    const parser = createParser(program, config);
    const formatter = createFormatter(config);
    const generator = new SchemaGenerator(program, parser, formatter, config);

    const schema = generator.createSchema(typeName) as JSONSchema7;

    // Post-process: inline $ref definitions so @rjsf can render without issues
    return inlineRefs(schema);
  } catch {
    // Schema generation failed -- return permissive fallback
    // Common causes: conditional types, complex mapped types, missing imports
    return { ...FALLBACK_SCHEMA };
  }
}

/**
 * Inline $ref pointers by resolving them from $defs/definitions.
 * This flattens the schema so @rjsf doesn't need to handle $ref resolution.
 */
function inlineRefs(schema: JSONSchema7): JSONSchema7 {
  const defs = schema.$defs ?? schema.definitions ?? {};
  if (Object.keys(defs).length === 0) {
    return schema;
  }

  const resolved = resolveRefs(schema, defs);

  // Remove definition containers from the output
  delete resolved.$defs;
  delete resolved.definitions;

  return resolved;
}

/**
 * Recursively resolve $ref pointers in a schema object.
 * Uses a depth limit to avoid infinite recursion on circular refs.
 */
function resolveRefs(
  node: JSONSchema7,
  defs: Record<string, JSONSchema7>,
  depth = 0,
): JSONSchema7 {
  if (depth > 10) return node; // Bail on deep/circular refs

  // If this node is a $ref, resolve it
  if (node.$ref) {
    const refPath = node.$ref;
    // Handle #/$defs/TypeName or #/definitions/TypeName
    const match = refPath.match(/^#\/(?:\$defs|definitions)\/(.+)$/);
    if (match && defs[match[1]]) {
      // Merge the resolved def (may itself contain $refs)
      return resolveRefs({ ...defs[match[1]] }, defs, depth + 1);
    }
    return node;
  }

  // Recursively process all schema-valued properties
  const result: JSONSchema7 = {};

  for (const [key, value] of Object.entries(node)) {
    if (key === "$defs" || key === "definitions") {
      continue; // Skip definition containers
    }

    if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = resolveRefs(value as JSONSchema7, defs, depth + 1);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        item && typeof item === "object"
          ? resolveRefs(item as JSONSchema7, defs, depth + 1)
          : item,
      );
    } else {
      result[key] = value;
    }
  }

  return result;
}
