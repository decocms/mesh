/**
 * Registry Tests
 *
 * Ensures registry.ts stays in sync with index.ts
 */

import { describe, expect, it } from "bun:test";
import { ALL_TOOLS, type ToolNameFromTools } from "./index";
import { MANAGEMENT_TOOLS, type ToolName } from "./registry";

describe("Tool Registry Sync", () => {
  it("should have MANAGEMENT_TOOLS entries for all tools in ALL_TOOLS", () => {
    const allToolNames = ALL_TOOLS.map((t) => t.name);
    const registryToolNames = MANAGEMENT_TOOLS.map((t) => t.name);

    // Check ALL_TOOLS → MANAGEMENT_TOOLS
    for (const toolName of allToolNames) {
      expect(
        registryToolNames,
        `Missing "${toolName}" in MANAGEMENT_TOOLS (registry.ts). Add it!`,
      ).toContain(toolName);
    }

    // Check MANAGEMENT_TOOLS → ALL_TOOLS
    for (const toolName of registryToolNames) {
      expect(
        allToolNames,
        `Extra "${toolName}" in MANAGEMENT_TOOLS (registry.ts) not in ALL_TOOLS (index.ts). Remove it!`,
      ).toContain(toolName);
    }
  });

  it("should have matching ToolName types", () => {
    // This is a compile-time check - if the types diverge, this won't compile
    const _checkToolNameCompat: ToolName = "" as ToolNameFromTools;
    const _checkToolNameFromToolsCompat: ToolNameFromTools = "" as ToolName;
    // Mark as intentionally unused for type checking only
    void _checkToolNameCompat;
    void _checkToolNameFromToolsCompat;

    // Runtime check for same length
    const allToolNames = ALL_TOOLS.map((t) => t.name);
    const registryToolNames = MANAGEMENT_TOOLS.map((t) => t.name);
    expect(registryToolNames.length).toBe(allToolNames.length);
  });
});
