/**
 * Decopilot Built-in Tools
 *
 * Client-side and server-side tools for decopilot agent interactions.
 * These use AI SDK tool() function and are registered directly in the decopilot API.
 */

import type { MeshContext, OrganizationScope } from "@/core/mesh-context";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { UIMessageStreamWriter } from "ai";
import { createAgentSearchTool } from "./agent-search";
import { createSubtaskTool } from "./subtask";
import { createToolSearchTool } from "./tool-search";
import { userAskTool } from "./user-ask";
import type { ModelProvider, ModelsConfig } from "../types";

export interface BuiltinToolParams {
  modelProvider: ModelProvider;
  organization: OrganizationScope;
  models: ModelsConfig;
}

/**
 * Get all built-in tools as a ToolSet.
 * Deps required so ChatMessage type (via ReturnType<typeof getBuiltInTools>)
 * always includes subtask in the parts union.
 */
export function getBuiltInTools(
  writer: UIMessageStreamWriter,
  params: BuiltinToolParams,
  ctx: MeshContext,
  mcpClient: Client,
) {
  const { modelProvider, organization, models } = params;
  return {
    user_ask: userAskTool,
    subtask: createSubtaskTool(
      writer,
      { modelProvider, organization, models },
      ctx,
    ),
    agent_search: createAgentSearchTool(writer, { organization }, ctx),
    tool_search: createToolSearchTool(writer, mcpClient),
  } as const;
}
