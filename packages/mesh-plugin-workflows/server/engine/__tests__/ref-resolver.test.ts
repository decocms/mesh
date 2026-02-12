/**
 * Ref Resolver Tests
 *
 * Unit tests for the @ref resolution system (pure functions, no DB needed).
 */

import { describe, it, expect } from "bun:test";
import {
  parseAtRef,
  resolveRef,
  resolveAllRefs,
  extractRefs,
  getValueByPath,
  isAtRef,
  type RefContext,
} from "../../engine/ref-resolver";

// ============================================================================
// Helpers
// ============================================================================

function makeCtx(overrides?: Partial<RefContext>): RefContext {
  return {
    workflowInput: {},
    stepOutputs: new Map(),
    ...overrides,
  };
}

// ============================================================================
// parseAtRef
// ============================================================================

describe("parseAtRef", () => {
  it("parses @input.field as input type", () => {
    const result = parseAtRef("@input.userId");
    expect(result.type).toBe("input");
    expect(result.path).toBe("userId");
  });

  it("parses @input without path", () => {
    const result = parseAtRef("@input");
    expect(result.type).toBe("input");
    expect(result.path).toBe("");
  });

  it("parses @stepName.field as step type", () => {
    const result = parseAtRef("@fetchUsers.data");
    expect(result.type).toBe("step");
    expect(result.stepName).toBe("fetchUsers");
    expect(result.path).toBe("data");
  });

  it("parses @stepName without path", () => {
    const result = parseAtRef("@fetchUsers");
    expect(result.type).toBe("step");
    expect(result.stepName).toBe("fetchUsers");
    expect(result.path).toBe("");
  });

  it("parses @item as item type", () => {
    const result = parseAtRef("@item");
    expect(result.type).toBe("item");
    expect(result.path).toBe("");
  });

  it("parses @item.field as item type with path", () => {
    const result = parseAtRef("@item.name");
    expect(result.type).toBe("item");
    expect(result.path).toBe("name");
  });

  it("parses @index as index type", () => {
    const result = parseAtRef("@index");
    expect(result.type).toBe("index");
  });

  it("parses nested path @stepName.data.nested.field", () => {
    const result = parseAtRef("@myStep.data.nested.field");
    expect(result.type).toBe("step");
    expect(result.stepName).toBe("myStep");
    expect(result.path).toBe("data.nested.field");
  });
});

// ============================================================================
// isAtRef
// ============================================================================

describe("isAtRef", () => {
  it("returns true for @ref strings", () => {
    expect(isAtRef("@input.field")).toBe(true);
    expect(isAtRef("@step.output")).toBe(true);
    expect(isAtRef("@item")).toBe(true);
  });

  it("returns false for non-@ref values", () => {
    expect(isAtRef("hello")).toBe(false);
    expect(isAtRef(42)).toBe(false);
    expect(isAtRef(null)).toBe(false);
    expect(isAtRef(undefined)).toBe(false);
    expect(isAtRef({})).toBe(false);
  });
});

// ============================================================================
// getValueByPath
// ============================================================================

describe("getValueByPath", () => {
  it("returns the object itself for empty path", () => {
    const obj = { a: 1 };
    expect(getValueByPath(obj, "")).toEqual({ a: 1 });
  });

  it("traverses nested objects", () => {
    const obj = { data: { nested: { field: "value" } } };
    expect(getValueByPath(obj, "data.nested.field")).toBe("value");
  });

  it("traverses arrays by index", () => {
    const obj = { items: [10, 20, 30] };
    expect(getValueByPath(obj, "items.1")).toBe(20);
  });

  it("returns undefined for missing paths", () => {
    const obj = { a: 1 };
    expect(getValueByPath(obj, "b.c")).toBeUndefined();
  });

  it("returns undefined for null intermediate", () => {
    expect(getValueByPath(null, "a.b")).toBeUndefined();
  });
});

// ============================================================================
// resolveRef
// ============================================================================

describe("resolveRef", () => {
  it("resolves @input.field to workflow input", () => {
    const ctx = makeCtx({ workflowInput: { userId: "u123" } });
    const result = resolveRef("@input.userId", ctx);
    expect(result.value).toBe("u123");
    expect(result.error).toBeUndefined();
  });

  it("resolves @input to entire workflow input", () => {
    const ctx = makeCtx({ workflowInput: { a: 1, b: 2 } });
    const result = resolveRef("@input", ctx);
    expect(result.value).toEqual({ a: 1, b: 2 });
  });

  it("resolves @stepName.field to step output", () => {
    const stepOutputs = new Map<string, unknown>();
    stepOutputs.set("fetchUsers", { data: [{ id: 1 }] });
    const ctx = makeCtx({ stepOutputs });

    const result = resolveRef("@fetchUsers.data", ctx);
    expect(result.value).toEqual([{ id: 1 }]);
  });

  it("resolves @stepName to entire step output", () => {
    const stepOutputs = new Map<string, unknown>();
    stepOutputs.set("myStep", { result: "ok" });
    const ctx = makeCtx({ stepOutputs });

    const result = resolveRef("@myStep", ctx);
    expect(result.value).toEqual({ result: "ok" });
  });

  it("returns error for missing step output", () => {
    const ctx = makeCtx();
    const result = resolveRef("@nonExistent.field", ctx);
    expect(result.value).toBeUndefined();
    expect(result.error).toContain("not found or not completed");
  });

  it("resolves @item in forEach context", () => {
    const ctx = makeCtx({ item: { name: "Alice" } });
    const result = resolveRef("@item", ctx);
    expect(result.value).toEqual({ name: "Alice" });
  });

  it("resolves @item.field in forEach context", () => {
    const ctx = makeCtx({ item: { name: "Alice", age: 30 } });
    const result = resolveRef("@item.name", ctx);
    expect(result.value).toBe("Alice");
  });

  it("returns error for @item outside forEach context", () => {
    const ctx = makeCtx();
    const result = resolveRef("@item", ctx);
    expect(result.error).toContain("outside of forEach");
  });

  it("resolves @index in forEach context", () => {
    const ctx = makeCtx({ index: 3 });
    const result = resolveRef("@index", ctx);
    expect(result.value).toBe(3);
  });

  it("resolves nested path @step.data.nested.field", () => {
    const stepOutputs = new Map<string, unknown>();
    stepOutputs.set("step1", { data: { nested: { field: "deep" } } });
    const ctx = makeCtx({ stepOutputs });

    const result = resolveRef("@step1.data.nested.field", ctx);
    expect(result.value).toBe("deep");
  });

  it("returns error for missing input path", () => {
    const ctx = makeCtx({ workflowInput: { a: 1 } });
    const result = resolveRef("@input.nonExistent", ctx);
    expect(result.value).toBeUndefined();
    expect(result.error).toContain("Input path not found");
  });
});

// ============================================================================
// resolveAllRefs
// ============================================================================

describe("resolveAllRefs", () => {
  it("resolves direct @ref values", () => {
    const ctx = makeCtx({ workflowInput: { name: "Alice" } });
    const { resolved } = resolveAllRefs({ user: "@input.name" }, ctx);
    expect(resolved).toEqual({ user: "Alice" });
  });

  it("resolves nested objects with @refs", () => {
    const stepOutputs = new Map<string, unknown>();
    stepOutputs.set("step1", { count: 42 });
    const ctx = makeCtx({ stepOutputs, workflowInput: { id: "u1" } });

    const { resolved } = resolveAllRefs(
      {
        userId: "@input.id",
        data: { total: "@step1.count" },
      },
      ctx,
    );

    expect(resolved).toEqual({
      userId: "u1",
      data: { total: 42 },
    });
  });

  it("resolves arrays with @refs", () => {
    const ctx = makeCtx({ workflowInput: { a: 1, b: 2 } });
    const { resolved } = resolveAllRefs(["@input.a", "@input.b"], ctx);
    expect(resolved).toEqual([1, 2]);
  });

  it("handles string interpolation with multiple refs", () => {
    const ctx = makeCtx({ workflowInput: { first: "Alice", last: "Smith" } });
    const { resolved } = resolveAllRefs(
      { greeting: "Hello @input.first @input.last!" },
      ctx,
    );
    expect(resolved).toEqual({ greeting: "Hello Alice Smith!" });
  });

  it("preserves primitive values", () => {
    const ctx = makeCtx();
    const { resolved } = resolveAllRefs(
      { num: 42, bool: true, str: "hello", nil: null },
      ctx,
    );
    expect(resolved).toEqual({ num: 42, bool: true, str: "hello", nil: null });
  });

  it("collects errors for unresolvable refs", () => {
    const ctx = makeCtx();
    const { errors } = resolveAllRefs({ data: "@nonExistent.field" }, ctx);
    expect(errors).toBeDefined();
    expect(errors!.length).toBeGreaterThan(0);
    expect(errors![0].ref).toBe("@nonExistent.field");
  });

  it("resolves @item and @index in forEach context", () => {
    const ctx = makeCtx({ item: { id: "item_1" }, index: 0 });
    const { resolved } = resolveAllRefs(
      { itemId: "@item.id", idx: "@index" },
      ctx,
    );
    expect(resolved).toEqual({ itemId: "item_1", idx: 0 });
  });

  it("handles object traversal with mixed refs and literals", () => {
    const stepOutputs = new Map<string, unknown>();
    stepOutputs.set("fetch", { users: [{ name: "Bob" }] });
    const ctx = makeCtx({ stepOutputs });

    const { resolved } = resolveAllRefs(
      {
        data: "@fetch.users",
        static: "literal",
        count: 5,
      },
      ctx,
    );

    expect(resolved).toEqual({
      data: [{ name: "Bob" }],
      static: "literal",
      count: 5,
    });
  });
});

// ============================================================================
// extractRefs
// ============================================================================

describe("extractRefs", () => {
  it("extracts direct @ref values", () => {
    const refs = extractRefs({ a: "@input.field", b: "@step1.output" });
    expect(refs).toContain("@input.field");
    expect(refs).toContain("@step1.output");
  });

  it("extracts @refs from nested objects", () => {
    const refs = extractRefs({ nested: { deep: "@step2.data" } });
    expect(refs).toContain("@step2.data");
  });

  it("extracts @refs from arrays", () => {
    const refs = extractRefs(["@input.a", "@input.b"]);
    expect(refs).toContain("@input.a");
    expect(refs).toContain("@input.b");
  });

  it("extracts @refs from interpolated strings", () => {
    const refs = extractRefs({
      msg: "Hello @input.name, you have @step1.count items",
    });
    expect(refs).toContain("@input.name");
    expect(refs).toContain("@step1.count");
  });

  it("returns empty array for no refs", () => {
    const refs = extractRefs({ a: "hello", b: 42, c: null });
    expect(refs).toEqual([]);
  });

  it("extracts @item and @index refs", () => {
    const refs = extractRefs({ id: "@item.id", pos: "@index" });
    expect(refs).toContain("@item.id");
    expect(refs).toContain("@index");
  });
});
