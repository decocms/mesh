import { describe, expect, it } from "bun:test";
import {
  MCP_BINDING,
  McpConfigurationOutputSchema,
} from "../src/well-known/mcp";

describe("MCP Binding", () => {
  it("should match the expected structure", () => {
    expect(MCP_BINDING).toHaveLength(1);
    const tool = MCP_BINDING[0];
    expect(tool.name).toBe("MCP_CONFIGURATION");
    expect(tool.inputSchema).toBeDefined();
    expect(tool.outputSchema).toBeDefined();
  });

  it("should validate correct output", () => {
    const validOutput = {
      scopes: ["scope1", "scope2"],
      stateSchema: {
        type: "object",
        properties: {
          foo: { type: "string" },
        },
      },
    };

    const result = McpConfigurationOutputSchema.safeParse(validOutput);
    expect(result.success).toBe(true);
  });

  it("should fail on invalid output", () => {
    const invalidOutput = {
      scopes: "not-an-array", // Invalid
      stateSchema: { type: "object" },
    };

    const result = McpConfigurationOutputSchema.safeParse(invalidOutput);
    expect(result.success).toBe(false);
  });
});
