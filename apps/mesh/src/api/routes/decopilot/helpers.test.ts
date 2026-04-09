/**
 * Tests for Decopilot Helper Functions
 */

import { describe, expect, test } from "bun:test";
import {
  sanitizeToolName,
  toolNeedsApproval,
  type ToolApprovalLevel,
} from "./helpers";

describe("sanitizeToolName", () => {
  test("leaves valid names unchanged", () => {
    expect(sanitizeToolName("SEARCH")).toBe("SEARCH");
    expect(sanitizeToolName("my_tool")).toBe("my_tool");
    expect(sanitizeToolName("conn-abc_SEARCH")).toBe("conn-abc_SEARCH");
    expect(sanitizeToolName("tool.v2")).toBe("tool.v2");
    expect(sanitizeToolName("ns:action")).toBe("ns:action");
  });

  test("replaces invalid characters with underscores", () => {
    expect(sanitizeToolName("my tool")).toBe("my_tool");
    expect(sanitizeToolName("tool/action")).toBe("tool_action");
    expect(sanitizeToolName("tool@name#1")).toBe("tool_name_1");
  });

  test("prepends underscore when name starts with digit", () => {
    expect(sanitizeToolName("123tool")).toBe("_123tool");
    expect(sanitizeToolName("0_start")).toBe("_0_start");
  });

  test("prepends underscore for empty result", () => {
    expect(sanitizeToolName("")).toBe("_");
    expect(sanitizeToolName("!!!")).toBe("___");
  });

  test("truncates to 128 characters", () => {
    const longName = "a".repeat(200);
    expect(sanitizeToolName(longName).length).toBe(128);
  });
});

describe("toolNeedsApproval", () => {
  describe('approval level: "auto"', () => {
    const level: ToolApprovalLevel = "auto";

    test("returns false when readOnlyHint is true", () => {
      expect(toolNeedsApproval(level, true)).toBe(false);
    });

    test("returns false when readOnlyHint is false", () => {
      expect(toolNeedsApproval(level, false)).toBe(false);
    });

    test("returns false when readOnlyHint is undefined", () => {
      expect(toolNeedsApproval(level, undefined)).toBe(false);
    });
  });

  describe('approval level: "plan"', () => {
    const level: ToolApprovalLevel = "plan";

    test("returns false when readOnlyHint is true (read-only allowed)", () => {
      expect(toolNeedsApproval(level, true)).toBe(false);
    });

    test('returns "hard-block" when readOnlyHint is false', () => {
      expect(toolNeedsApproval(level, false)).toBe("hard-block");
    });

    test('returns "hard-block" when readOnlyHint is undefined', () => {
      expect(toolNeedsApproval(level, undefined)).toBe("hard-block");
    });
  });

  describe('approval level: "readonly"', () => {
    const level: ToolApprovalLevel = "readonly";

    test("returns false when readOnlyHint is true (auto-approve)", () => {
      expect(toolNeedsApproval(level, true)).toBe(false);
    });

    test("returns true when readOnlyHint is false (requires approval)", () => {
      expect(toolNeedsApproval(level, false)).toBe(true);
    });

    test("returns true when readOnlyHint is undefined (requires approval)", () => {
      expect(toolNeedsApproval(level, undefined)).toBe(true);
    });
  });
});
