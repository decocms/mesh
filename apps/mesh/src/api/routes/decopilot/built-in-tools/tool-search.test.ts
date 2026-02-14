import { describe, expect, it, vi } from "bun:test";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  createToolSearchTool,
  type ToolSearchOutputSchema,
} from "./tool-search";
import type { z } from "zod";

type ToolSearchOutput = z.infer<typeof ToolSearchOutputSchema>;

describe("tool_search", () => {
  const mockWriter = {
    write: vi.fn(),
  };

  it("returns all tools when no query", async () => {
    const mockClient = {
      listTools: vi.fn().mockResolvedValue({
        tools: [
          { name: "slack_send", description: "Send a Slack message" },
          { name: "github_create_issue", description: "Create GitHub issue" },
        ],
      }),
    } as unknown as Client;

    const tool = createToolSearchTool(mockWriter as any, mockClient);
    const result = (await tool.execute?.({ query: undefined }, {
      toolCallId: "test-id",
    } as any)) as ToolSearchOutput;

    expect(result?.totalFound).toBe(2);
    expect(result?.tools).toHaveLength(2);
    expect(result?.tools[0]?.name).toBe("slack_send");
    expect(result?.tools[1]?.name).toBe("github_create_issue");
  });

  it("filters tools by query", async () => {
    const mockClient = {
      listTools: vi.fn().mockResolvedValue({
        tools: [
          { name: "slack_send", description: "Send a Slack message" },
          { name: "github_create_issue", description: "Create GitHub issue" },
        ],
      }),
    } as unknown as Client;

    const tool = createToolSearchTool(mockWriter as any, mockClient);
    const result = (await tool.execute?.({ query: "slack" }, {
      toolCallId: "test-id",
    } as any)) as ToolSearchOutput;

    expect(result?.totalFound).toBe(1);
    expect(result?.tools[0]?.name).toBe("slack_send");
  });

  it("searches in both name and description", async () => {
    const mockClient = {
      listTools: vi.fn().mockResolvedValue({
        tools: [
          { name: "tool1", description: "Does GitHub operations" },
          { name: "github_tool", description: "Something else" },
        ],
      }),
    } as unknown as Client;

    const tool = createToolSearchTool(mockWriter as any, mockClient);
    const result = (await tool.execute?.({ query: "github" }, {
      toolCallId: "test-id",
    } as any)) as ToolSearchOutput;

    expect(result?.totalFound).toBe(2);
  });

  it("handles empty query string", async () => {
    const mockClient = {
      listTools: vi.fn().mockResolvedValue({
        tools: [
          { name: "tool1", description: "First tool" },
          { name: "tool2", description: "Second tool" },
        ],
      }),
    } as unknown as Client;

    const tool = createToolSearchTool(mockWriter as any, mockClient);
    const result = (await tool.execute?.({ query: "   " }, {
      toolCallId: "test-id",
    } as any)) as ToolSearchOutput;

    expect(result?.totalFound).toBe(2);
  });

  it("handles tools with missing descriptions", async () => {
    const mockClient = {
      listTools: vi.fn().mockResolvedValue({
        tools: [{ name: "tool1", description: null }, { name: "tool2" }],
      }),
    } as unknown as Client;

    const tool = createToolSearchTool(mockWriter as any, mockClient);
    const result = (await tool.execute?.({ query: undefined }, {
      toolCallId: "test-id",
    } as any)) as ToolSearchOutput;

    expect(result?.totalFound).toBe(2);
    expect(result?.tools[0]?.description).toBe("");
    expect(result?.tools[1]?.description).toBe("");
  });

  it("writes tool metadata", async () => {
    const mockClient = {
      listTools: vi.fn().mockResolvedValue({
        tools: [],
      }),
    } as unknown as Client;

    const tool = createToolSearchTool(mockWriter as any, mockClient);
    await tool.execute?.({ query: undefined }, {
      toolCallId: "test-123",
    } as any);

    expect(mockWriter.write).toHaveBeenCalledWith({
      type: "data-tool-metadata",
      id: "test-123",
      data: {
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        latencyMs: expect.any(Number),
      },
    });
  });
});
