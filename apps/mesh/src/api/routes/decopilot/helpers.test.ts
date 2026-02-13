/**
 * Tests for Decopilot Helper Functions
 */

import { describe, expect, test } from "bun:test";
import { toolNeedsApproval, type ToolApprovalLevel } from "./helpers";

describe("toolNeedsApproval", () => {
  describe('approval level: "yolo"', () => {
    const level: ToolApprovalLevel = "yolo";

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

  describe('approval level: "none"', () => {
    const level: ToolApprovalLevel = "none";

    test("returns true when readOnlyHint is true", () => {
      expect(toolNeedsApproval(level, true)).toBe(true);
    });

    test("returns true when readOnlyHint is false", () => {
      expect(toolNeedsApproval(level, false)).toBe(true);
    });

    test("returns true when readOnlyHint is undefined", () => {
      expect(toolNeedsApproval(level, undefined)).toBe(true);
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
