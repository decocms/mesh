/**
 * Input schema validation utilities.
 *
 * Shared between collection (write-time) and execution (run-time) tools
 * so the same guards apply in both paths.
 */

const MAX_SCHEMA_SIZE = 100_000;
const MAX_SCHEMA_DEPTH = 10;

/**
 * Check that a JSON Schema does not exceed a maximum nesting depth.
 * Prevents overly complex schemas from causing stack overflows during conversion.
 */
export function checkSchemaDepth(
  schema: unknown,
  maxDepth: number = MAX_SCHEMA_DEPTH,
  current = 0,
): void {
  if (current > maxDepth) {
    throw new Error("Input schema exceeds maximum nesting depth");
  }
  if (schema == null || typeof schema !== "object" || Array.isArray(schema)) {
    return;
  }
  const obj = schema as Record<string, unknown>;
  if (obj.properties && typeof obj.properties === "object") {
    for (const val of Object.values(
      obj.properties as Record<string, unknown>,
    )) {
      checkSchemaDepth(val, maxDepth, current + 1);
    }
  }
  if (obj.items) {
    checkSchemaDepth(obj.items, maxDepth, current + 1);
  }
  if (
    obj.additionalProperties &&
    typeof obj.additionalProperties === "object"
  ) {
    checkSchemaDepth(obj.additionalProperties, maxDepth, current + 1);
  }
  // Recurse into composition keywords that zod-from-json-schema also processes
  for (const keyword of [
    "anyOf",
    "allOf",
    "oneOf",
    "not",
    "if",
    "then",
    "else",
  ]) {
    const sub = obj[keyword];
    if (Array.isArray(sub)) {
      for (const item of sub) {
        checkSchemaDepth(item, maxDepth, current + 1);
      }
    } else if (sub && typeof sub === "object") {
      checkSchemaDepth(sub, maxDepth, current + 1);
    }
  }
  // Recurse into $defs / definitions
  for (const defsKey of ["$defs", "definitions"]) {
    const defs = obj[defsKey];
    if (defs && typeof defs === "object" && !Array.isArray(defs)) {
      for (const val of Object.values(defs as Record<string, unknown>)) {
        checkSchemaDepth(val, maxDepth, current + 1);
      }
    }
  }
}

/**
 * Recursively strip `pattern` and `patternProperties` keys from a JSON Schema object.
 * This is a ReDoS mitigation — user-supplied regex patterns could be crafted
 * to cause catastrophic backtracking when compiled into RegExp by Zod.
 */
export function stripPatterns(schema: unknown): unknown {
  if (schema == null || typeof schema !== "object") return schema;
  if (Array.isArray(schema)) return schema.map(stripPatterns);
  const obj = schema as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === "pattern" || key === "patternProperties") continue;
    result[key] = stripPatterns(value);
  }
  return result;
}

/**
 * Validate an input schema at write time (CREATE / UPDATE).
 * Throws on size or depth violations.
 */
export function validateInputSchema(
  schema: Record<string, unknown> | null | undefined,
): void {
  if (schema == null) return;
  const schemaStr = JSON.stringify(schema);
  if (schemaStr.length > MAX_SCHEMA_SIZE) {
    throw new Error("Input schema exceeds size limit");
  }
  checkSchemaDepth(schema);
}
