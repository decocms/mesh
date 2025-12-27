export interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  description?: string;
  enum?: unknown[];
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  $ref?: string;
  additionalProperties?: boolean | JsonSchema;
  not?: JsonSchema;
}

/**
 * Convert a TypeScript type string to JSON Schema.
 */
function typeToJsonSchema(typeStr: string): JsonSchema {
  const trimmed = typeStr.trim();

  // Handle union types: A | B | C
  if (trimmed.includes("|")) {
    const parts = splitUnionOrIntersection(trimmed, "|");
    if (parts.length > 1) {
      // Check if it's a simple nullable type: string | null
      const nonNullParts = parts.filter(
        (p) => p.trim() !== "null" && p.trim() !== "undefined",
      );
      const hasNull = parts.some(
        (p) => p.trim() === "null" || p.trim() === "undefined",
      );

      if (nonNullParts.length === 1 && nonNullParts[0] && hasNull) {
        // Simple nullable type
        const baseSchema = typeToJsonSchema(nonNullParts[0]);
        return { anyOf: [baseSchema, { type: "null" }] };
      }

      return { anyOf: parts.map((p) => typeToJsonSchema(p.trim())) };
    }
  }

  // Handle intersection types: A & B
  if (trimmed.includes("&")) {
    const parts = splitUnionOrIntersection(trimmed, "&");
    if (parts.length > 1) {
      return { allOf: parts.map((p) => typeToJsonSchema(p.trim())) };
    }
  }

  // Handle array types: Type[] or Array<Type>
  if (trimmed.endsWith("[]")) {
    const itemType = trimmed.slice(0, -2).trim();
    return { type: "array", items: typeToJsonSchema(itemType) };
  }

  const arrayMatch = trimmed.match(/^Array<(.+)>$/);
  if (arrayMatch?.[1]) {
    return { type: "array", items: typeToJsonSchema(arrayMatch[1]) };
  }

  // Handle Record<K, V>
  const recordMatch = trimmed.match(/^Record<\s*string\s*,\s*(.+)\s*>$/);
  if (recordMatch?.[1]) {
    return {
      type: "object",
      additionalProperties: typeToJsonSchema(recordMatch[1]),
    };
  }

  // Handle Promise<T> - unwrap the promise
  const promiseMatch = trimmed.match(/^Promise<(.+)>$/);
  if (promiseMatch?.[1]) {
    return typeToJsonSchema(promiseMatch[1]);
  }

  // Handle inline object types: { prop: Type; ... }
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return parseInlineObject(trimmed);
  }

  // Handle string literal types: "value1" | "value2"
  if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
    const literalValue = trimmed.slice(1, -1);
    return { type: "string", enum: [literalValue] };
  }

  // Handle number literal
  if (/^\d+$/.test(trimmed)) {
    return { type: "number", enum: [parseInt(trimmed, 10)] };
  }

  // Primitive types
  switch (trimmed) {
    case "string":
      return { type: "string" };
    case "number":
      return { type: "number" };
    case "boolean":
      return { type: "boolean" };
    case "null":
      return { type: "null" };
    case "undefined":
      return { type: "null" }; // JSON Schema doesn't have undefined
    case "any":
    case "unknown":
      return {}; // Any type in JSON Schema
    case "void":
      return { type: "null" };
    case "never":
      return { not: {} };
    case "object":
      return { type: "object" };
    default:
      // Unknown type, treat as any
      return {};
  }
}

/**
 * Split a type string by union (|) or intersection (&) operators,
 * respecting nested generics and objects.
 */
function splitUnionOrIntersection(
  typeStr: string,
  separator: "|" | "&",
): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let inString = false;
  let stringChar = "";

  for (let i = 0; i < typeStr.length; i++) {
    const char = typeStr[i];
    const prevChar = typeStr[i - 1];

    // Handle string literals
    if ((char === '"' || char === "'") && prevChar !== "\\") {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
    }

    if (!inString) {
      if (char === "<" || char === "{" || char === "(") {
        depth++;
      } else if (char === ">" || char === "}" || char === ")") {
        depth--;
      } else if (char === separator && depth === 0) {
        parts.push(current.trim());
        current = "";
        continue;
      }
    }

    current += char;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

/**
 * Parse an inline object type: { prop: Type; ... }
 */
function parseInlineObject(typeStr: string): JsonSchema {
  const inner = typeStr.slice(1, -1).trim();
  if (!inner) {
    return { type: "object" };
  }

  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];

  // Simple property parsing - handles basic cases
  const propRegex = /(\w+)(\?)?:\s*([^;]+);?/g;
  let match;

  while ((match = propRegex.exec(inner)) !== null) {
    const [, name, optional, type] = match;
    if (!name || !type) continue;
    properties[name] = typeToJsonSchema(type.trim());
    if (!optional) {
      required.push(name);
    }
  }

  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

/**
 * Convert a JSON Schema to a TypeScript interface string.
 *
 * @param schema - JSON Schema object
 * @param typeName - Name for the generated interface (default: "Output")
 * @returns TypeScript interface declaration string
 */
export function jsonSchemaToTypeScript(
  schema: Record<string, unknown> | null | undefined,
  typeName: string = "Output",
): string {
  if (!schema) return `interface ${typeName} {}`;

  function schemaToType(s: Record<string, unknown>): string {
    if (!s || typeof s !== "object") return "unknown";

    const type = s.type as string | string[] | undefined;

    if (Array.isArray(type)) {
      return type.map((t) => primitiveToTs(t)).join(" | ");
    }

    switch (type) {
      case "string":
        if (s.enum)
          return (s.enum as string[]).map((e) => `"${e}"`).join(" | ");
        return "string";
      case "number":
      case "integer":
        return "number";
      case "boolean":
        return "boolean";
      case "null":
        return "null";
      case "array": {
        const items = s.items as Record<string, unknown> | undefined;
        return items ? `${schemaToType(items)}[]` : "unknown[]";
      }
      case "object":
        return objectToType(s);
      default:
        if (s.anyOf)
          return (s.anyOf as Record<string, unknown>[])
            .map(schemaToType)
            .join(" | ");
        if (s.oneOf)
          return (s.oneOf as Record<string, unknown>[])
            .map(schemaToType)
            .join(" | ");
        if (s.allOf)
          return (s.allOf as Record<string, unknown>[])
            .map(schemaToType)
            .join(" & ");
        return "unknown";
    }
  }

  function primitiveToTs(t: string): string {
    switch (t) {
      case "string":
        return "string";
      case "number":
      case "integer":
        return "number";
      case "boolean":
        return "boolean";
      case "null":
        return "null";
      default:
        return "unknown";
    }
  }

  function objectToType(s: Record<string, unknown>): string {
    const props = s.properties as
      | Record<string, Record<string, unknown>>
      | undefined;
    if (!props) return "Record<string, unknown>";

    const required = new Set((s.required as string[]) || []);
    const lines = Object.entries(props).map(([key, value]) => {
      const optional = required.has(key) ? "" : "?";
      const desc = value.description ? `  /** ${value.description} */\n` : "";
      return `${desc}  ${key}${optional}: ${schemaToType(value)};`;
    });

    return `{\n${lines.join("\n")}\n}`;
  }

  return `interface ${typeName} ${schemaToType(schema as Record<string, unknown>)}`;
}
