/**
 * Tests for input schema validation utilities (checkSchemaDepth, stripPatterns, validateInputSchema).
 */

import { describe, it, expect } from "bun:test";
import {
  checkSchemaDepth,
  stripPatterns,
  validateInputSchema,
} from "../schema-validation";

// ============================================================================
// checkSchemaDepth
// ============================================================================

describe("checkSchemaDepth", () => {
  it("accepts a flat schema", () => {
    expect(() =>
      checkSchemaDepth(
        { type: "object", properties: { name: { type: "string" } } },
        10,
      ),
    ).not.toThrow();
  });

  it("accepts a schema at exactly the max depth", () => {
    // Build a schema nested exactly 3 levels via properties
    const schema = {
      type: "object",
      properties: {
        a: {
          type: "object",
          properties: {
            b: {
              type: "object",
              properties: { c: { type: "string" } },
            },
          },
        },
      },
    };
    expect(() => checkSchemaDepth(schema, 3)).not.toThrow();
  });

  it("rejects a schema exceeding max depth via properties", () => {
    const schema = {
      type: "object",
      properties: {
        a: {
          type: "object",
          properties: {
            b: {
              type: "object",
              properties: {
                c: {
                  type: "object",
                  properties: { d: { type: "string" } },
                },
              },
            },
          },
        },
      },
    };
    expect(() => checkSchemaDepth(schema, 3)).toThrow(
      "Input schema exceeds maximum nesting depth",
    );
  });

  it("rejects deeply nested items", () => {
    let schema: Record<string, unknown> = { type: "string" };
    for (let i = 0; i < 12; i++) {
      schema = { type: "array", items: schema };
    }
    expect(() => checkSchemaDepth(schema, 10)).toThrow(
      "Input schema exceeds maximum nesting depth",
    );
  });

  it("rejects deeply nested additionalProperties", () => {
    let schema: Record<string, unknown> = { type: "string" };
    for (let i = 0; i < 12; i++) {
      schema = { type: "object", additionalProperties: schema };
    }
    expect(() => checkSchemaDepth(schema, 10)).toThrow(
      "Input schema exceeds maximum nesting depth",
    );
  });

  it("rejects deeply nested anyOf", () => {
    let schema: Record<string, unknown> = { type: "string" };
    for (let i = 0; i < 12; i++) {
      schema = { anyOf: [schema] };
    }
    expect(() => checkSchemaDepth(schema, 10)).toThrow(
      "Input schema exceeds maximum nesting depth",
    );
  });

  it("rejects deeply nested allOf", () => {
    let schema: Record<string, unknown> = { type: "string" };
    for (let i = 0; i < 12; i++) {
      schema = { allOf: [schema] };
    }
    expect(() => checkSchemaDepth(schema, 10)).toThrow(
      "Input schema exceeds maximum nesting depth",
    );
  });

  it("rejects deeply nested oneOf", () => {
    let schema: Record<string, unknown> = { type: "string" };
    for (let i = 0; i < 12; i++) {
      schema = { oneOf: [schema] };
    }
    expect(() => checkSchemaDepth(schema, 10)).toThrow(
      "Input schema exceeds maximum nesting depth",
    );
  });

  it("rejects deep nesting via not", () => {
    let schema: Record<string, unknown> = { type: "string" };
    for (let i = 0; i < 12; i++) {
      schema = { not: schema };
    }
    expect(() => checkSchemaDepth(schema, 10)).toThrow(
      "Input schema exceeds maximum nesting depth",
    );
  });

  it("rejects deep nesting via $defs", () => {
    let schema: Record<string, unknown> = { type: "string" };
    for (let i = 0; i < 12; i++) {
      schema = { $defs: { inner: schema } };
    }
    expect(() => checkSchemaDepth(schema, 10)).toThrow(
      "Input schema exceeds maximum nesting depth",
    );
  });

  it("handles null / primitive inputs without throwing", () => {
    expect(() => checkSchemaDepth(null, 10)).not.toThrow();
    expect(() => checkSchemaDepth("string", 10)).not.toThrow();
    expect(() => checkSchemaDepth(42, 10)).not.toThrow();
  });

  it("uses default depth of 10 when not specified", () => {
    let schema: Record<string, unknown> = { type: "string" };
    for (let i = 0; i < 11; i++) {
      schema = { type: "object", properties: { x: schema } };
    }
    expect(() => checkSchemaDepth(schema)).toThrow(
      "Input schema exceeds maximum nesting depth",
    );
  });
});

// ============================================================================
// stripPatterns
// ============================================================================

describe("stripPatterns", () => {
  it("removes top-level pattern keys", () => {
    const schema = { type: "string", pattern: "^evil$" };
    const result = stripPatterns(schema) as Record<string, unknown>;
    expect(result).toEqual({ type: "string" });
    expect(result.pattern).toBeUndefined();
  });

  it("removes deeply nested pattern keys", () => {
    const schema = {
      type: "object",
      properties: {
        name: { type: "string", pattern: "^[a-z]+$" },
        nested: {
          type: "object",
          properties: {
            email: { type: "string", pattern: ".*@.*" },
          },
        },
      },
    };
    const result = stripPatterns(schema) as Record<string, unknown>;
    const props = result.properties as Record<string, Record<string, unknown>>;
    expect(props.name.pattern).toBeUndefined();
    expect(
      (props.nested.properties as Record<string, Record<string, unknown>>).email
        .pattern,
    ).toBeUndefined();
  });

  it("removes patternProperties keys", () => {
    const schema = {
      type: "object",
      patternProperties: { "^S_": { type: "string" } },
      properties: { name: { type: "string" } },
    };
    const result = stripPatterns(schema) as Record<string, unknown>;
    expect(result.patternProperties).toBeUndefined();
    expect(result.properties).toBeDefined();
  });

  it("removes patternProperties from nested schemas", () => {
    const schema = {
      type: "object",
      properties: {
        inner: {
          type: "object",
          patternProperties: { "^x_": { type: "number" } },
        },
      },
    };
    const result = stripPatterns(schema) as Record<string, unknown>;
    const inner = (result.properties as Record<string, Record<string, unknown>>)
      .inner;
    expect(inner.patternProperties).toBeUndefined();
  });

  it("preserves property definitions named 'pattern'", () => {
    const schema = {
      type: "object",
      properties: {
        pattern: { type: "string", description: "A regex pattern" },
      },
    };
    const result = stripPatterns(schema) as Record<string, unknown>;
    const props = result.properties as Record<string, Record<string, unknown>>;
    // The property *named* "pattern" should be preserved (it's a field definition, not a regex)
    expect(props.pattern).toBeDefined();
    expect(props.pattern.type).toBe("string");
  });

  it("preserves non-string pattern values", () => {
    // Unlikely but defensive: pattern key with a non-string value is not a JSON Schema regex
    const schema = { type: "object", pattern: 42 };
    const result = stripPatterns(schema) as Record<string, unknown>;
    expect(result.pattern).toBe(42);
  });

  it("handles arrays", () => {
    const schema = [{ type: "string", pattern: "^a$" }, { type: "number" }];
    const result = stripPatterns(schema) as Record<string, unknown>[];
    expect(result).toEqual([{ type: "string" }, { type: "number" }]);
  });

  it("passes through primitives and null", () => {
    expect(stripPatterns(null)).toBeNull();
    expect(stripPatterns(42)).toBe(42);
    expect(stripPatterns("hello")).toBe("hello");
  });
});

// ============================================================================
// validateInputSchema
// ============================================================================

describe("validateInputSchema", () => {
  it("accepts null / undefined", () => {
    expect(() => validateInputSchema(null)).not.toThrow();
    expect(() => validateInputSchema(undefined)).not.toThrow();
  });

  it("accepts a valid small schema", () => {
    expect(() =>
      validateInputSchema({
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
      }),
    ).not.toThrow();
  });

  it("rejects schema exceeding size limit", () => {
    // Build a schema with a very long description to exceed 100KB
    const bigSchema = {
      type: "object",
      description: "x".repeat(100_001),
    };
    expect(() => validateInputSchema(bigSchema)).toThrow(
      "Input schema exceeds size limit",
    );
  });

  it("rejects schema exceeding depth limit", () => {
    let schema: Record<string, unknown> = { type: "string" };
    for (let i = 0; i < 12; i++) {
      schema = { type: "object", properties: { x: schema } };
    }
    expect(() => validateInputSchema(schema)).toThrow(
      "Input schema exceeds maximum nesting depth",
    );
  });
});
