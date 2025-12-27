import type { JSONSchema7 } from "../types/json-schema";

/**
 * AI-native TypeScript to JSON Schema extractor
 *
 * This uses pattern matching to extract types from TypeScript code.
 * In a full implementation, this would call an LLM API for more accurate extraction.
 */
export async function extractSchemaFromTypeScript(
  code: string,
  typeName: string
): Promise<JSONSchema7> {
  // For now, we use a heuristic-based approach
  // In production, this would call an AI API endpoint
  return parseTypeScriptToSchema(code, typeName);
}

function parseTypeScriptToSchema(code: string, typeName: string): JSONSchema7 {
  // Find the interface or type definition
  const interfaceMatch = new RegExp(
    `(?:export\\s+)?interface\\s+${typeName}\\s*\\{([^}]+(?:\\{[^}]*\\}[^}]*)*)\\}`,
    "s"
  ).exec(code);

  const typeMatch = new RegExp(
    `(?:export\\s+)?type\\s+${typeName}\\s*=\\s*\\{([^}]+(?:\\{[^}]*\\}[^}]*)*)\\}`,
    "s"
  ).exec(code);

  const match = interfaceMatch || typeMatch;

  if (!match) {
    throw new Error(`Could not find type or interface "${typeName}" in the code`);
  }

  const body = match[1];
  const properties: Record<string, JSONSchema7> = {};
  const required: string[] = [];

  // Parse each property line
  const lines = body.split("\n").filter((line) => line.trim());

  let currentComment = "";

  for (const line of lines) {
    const trimmed = line.trim();

    // Collect JSDoc comments
    if (trimmed.startsWith("/**") || trimmed.startsWith("*") || trimmed.startsWith("//")) {
      const commentMatch = /(?:\/\*\*|\*|\/\/)\s*(.*)/.exec(trimmed);
      if (commentMatch) {
        currentComment = commentMatch[1].replace(/\*\/\s*$/, "").trim();
      }
      continue;
    }

    // Parse property definition
    const propMatch = /^(\w+)(\?)?:\s*(.+?);?\s*$/.exec(trimmed);
    if (propMatch) {
      const [, propName, optional, typeStr] = propMatch;

      properties[propName] = parseTypeToSchema(typeStr.trim(), currentComment);

      if (!optional) {
        required.push(propName);
      }

      currentComment = "";
    }
  }

  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    title: typeName,
    type: "object",
    properties,
    required: required.length > 0 ? required : undefined,
  };
}

function parseTypeToSchema(typeStr: string, description?: string): JSONSchema7 {
  const schema: JSONSchema7 = {};

  if (description) {
    schema.description = description;
  }

  // Handle union types (string literals)
  if (typeStr.includes("|") && typeStr.includes('"')) {
    const values = typeStr
      .split("|")
      .map((s) => s.trim().replace(/"/g, "").replace(/'/g, ""));
    return {
      ...schema,
      type: "string",
      enum: values,
    };
  }

  // Handle arrays
  if (typeStr.endsWith("[]")) {
    const itemType = typeStr.slice(0, -2);
    return {
      ...schema,
      type: "array",
      items: parseTypeToSchema(itemType),
    };
  }

  // Handle Array<T>
  const arrayMatch = /^Array<(.+)>$/.exec(typeStr);
  if (arrayMatch) {
    return {
      ...schema,
      type: "array",
      items: parseTypeToSchema(arrayMatch[1]),
    };
  }

  // Handle inline object types
  if (typeStr.startsWith("{") && typeStr.endsWith("}")) {
    const innerContent = typeStr.slice(1, -1);
    return parseInlineObject(innerContent, description);
  }

  // Handle primitive types
  switch (typeStr) {
    case "string":
      return { ...schema, type: "string" };
    case "number":
      return { ...schema, type: "number" };
    case "boolean":
      return { ...schema, type: "boolean" };
    case "null":
      return { ...schema, type: "null" };
    case "any":
    case "unknown":
      return { ...schema };
    default:
      // Assume it's a string for now
      return { ...schema, type: "string" };
  }
}

function parseInlineObject(content: string, description?: string): JSONSchema7 {
  const properties: Record<string, JSONSchema7> = {};
  const required: string[] = [];

  // Simple inline object parsing
  const parts = content.split(";").filter((p) => p.trim());

  for (const part of parts) {
    const match = /(\w+)(\?)?:\s*(.+)/.exec(part.trim());
    if (match) {
      const [, propName, optional, typeStr] = match;
      properties[propName] = parseTypeToSchema(typeStr.trim());
      if (!optional) {
        required.push(propName);
      }
    }
  }

  return {
    type: "object",
    description,
    properties,
    required: required.length > 0 ? required : undefined,
  };
}

/**
 * Future: AI-powered schema extraction
 * This would call an LLM to accurately parse complex TypeScript types
 */
export async function extractSchemaWithAI(
  code: string,
  typeName: string,
  apiEndpoint: string
): Promise<JSONSchema7> {
  const response = await fetch(apiEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      typeName,
      prompt: `Extract JSON Schema from the TypeScript type "${typeName}".
Return a valid JSON Schema Draft 7 that accurately represents the type.
Include descriptions from JSDoc comments.
Infer appropriate formats (email, uri, date-time) when applicable.`,
    }),
  });

  if (!response.ok) {
    throw new Error("AI extraction failed");
  }

  return response.json();
}

