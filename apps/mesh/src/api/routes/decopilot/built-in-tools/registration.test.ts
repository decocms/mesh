/**
 * Tests for Built-in Tools Registration
 *
 * Verifies getBuiltInTools() returns correct ToolSet structure
 */

import { describe, expect, test } from "bun:test";
import { getBuiltInTools } from "./index";

describe("getBuiltInTools", () => {
  test("returns ToolSet with user_ask tool", () => {
    const tools = getBuiltInTools();

    expect(tools).toBeDefined();
    expect(tools.user_ask).toBeDefined();
  });

  test("user_ask tool has correct description", () => {
    const tools = getBuiltInTools();

    expect(tools.user_ask?.description).toBe(
      "Ask the user instead of guessing when requirements are ambiguous, multiple valid approaches exist, or before destructive changes. Prefer this tool over asking in plain text.",
    );
  });

  test("user_ask tool has no execute function", () => {
    const tools = getBuiltInTools();

    // Client-side tools should not have execute function defined
    // (execute is optional in AI SDK tool type)
    expect(tools.user_ask?.execute).toBeUndefined();
  });

  test("returns object matching ToolSet type structure", () => {
    const tools = getBuiltInTools();

    // ToolSet is Record<string, CoreTool>
    // Each tool should be an object with description, inputSchema, etc.
    expect(typeof tools).toBe("object");
    expect(Object.keys(tools)).toContain("user_ask");

    const userAskTool = tools.user_ask;
    expect(userAskTool).toHaveProperty("description");
    expect(typeof userAskTool?.description).toBe("string");
  });
});
