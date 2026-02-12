/**
 * Tests for Built-in Tools Registration
 *
 * Verifies getBuiltInTools() returns correct ToolSet structure
 */

import { describe, expect, test } from "bun:test";
import { getBuiltInTools, type SubtaskToolDeps } from "./index";

const mockDeps: SubtaskToolDeps = {
  ctx: {
    storage: { virtualMcps: { findById: () => Promise.resolve(null) } },
  } as never,
  modelProvider: { thinkingModel: {} as never } as never,
  organization: { id: "org_test" } as never,
  models: {
    connectionId: "conn_test",
    thinking: { id: "model_test" },
  } as never,
};

describe("getBuiltInTools", () => {
  test("returns ToolSet with user_ask tool", () => {
    const tools = getBuiltInTools(mockDeps);

    expect(tools).toBeDefined();
    expect(tools.user_ask).toBeDefined();
  });

  test("returns ToolSet with subtask tool", () => {
    const tools = getBuiltInTools(mockDeps);

    expect(tools).toBeDefined();
    expect(tools.subtask).toBeDefined();
  });

  test("user_ask tool has correct description", () => {
    const tools = getBuiltInTools(mockDeps);

    expect(tools.user_ask?.description).toBe(
      "Ask the user instead of guessing when requirements are ambiguous, multiple valid approaches exist, or before destructive changes. Prefer this tool over asking in plain text.",
    );
  });

  test("user_ask tool has no execute function", () => {
    const tools = getBuiltInTools(mockDeps);

    // Client-side tools should not have execute function defined
    // (execute is optional in AI SDK tool type)
    expect(tools.user_ask?.execute).toBeUndefined();
  });

  test("subtask tool has execute function", () => {
    const tools = getBuiltInTools(mockDeps);

    expect(tools.subtask?.execute).toBeDefined();
  });

  test("returns object matching ToolSet type structure", () => {
    const tools = getBuiltInTools(mockDeps);

    // ToolSet is Record<string, CoreTool>
    // Each tool should be an object with description, inputSchema, etc.
    expect(typeof tools).toBe("object");
    expect(Object.keys(tools)).toContain("user_ask");
    expect(Object.keys(tools)).toContain("subtask");

    const userAskTool = tools.user_ask;
    expect(userAskTool).toHaveProperty("description");
    expect(typeof userAskTool?.description).toBe("string");
  });
});
