/**
 * Decopilot Built-in Tools
 *
 * Client-side and server-side tools for decopilot agent interactions.
 * These use AI SDK tool() function and are registered directly in the decopilot API.
 */

import type { MeshContext, OrganizationScope } from "@/core/mesh-context";
import type { UIMessageStreamWriter } from "ai";
import { toolNeedsApproval, type ToolApprovalLevel } from "../helpers";
import { createAgentSearchTool } from "./agent-search";
import { createReadToolOutputTool } from "./read-tool-output";
import { createReadPromptTool } from "./prompts";
import { createReadResourceTool } from "./resources";
import { createSandboxTool, type VirtualClient } from "./sandbox";
import { createSubtaskTool } from "./subtask";
import { userAskTool } from "./user-ask";
import { proposePlanTool } from "./propose-plan";
import { createGenerateImageTool } from "./generate-image";
import type { ModelsConfig } from "../types";
import { MeshProvider } from "@/ai-providers/types";

export interface ImageConfig {
  imageModelId: string;
  defaultAspectRatio?: string;
  organizationId: string;
  agentId: string;
  userId: string;
  threadId: string;
}

export interface BuiltinToolParams {
  provider: MeshProvider;
  organization: OrganizationScope;
  models: ModelsConfig;
  toolApprovalLevel?: ToolApprovalLevel;
  toolOutputMap: Map<string, string>;
  passthroughClient: VirtualClient;
  imageConfig?: ImageConfig;
}

/**
 * Full tool set type — always includes propose_plan so that ChatMessage
 * (derived via ReturnType) can render historical plan parts regardless
 * of the current toolApprovalLevel.
 */
export type BuiltInToolSet = ReturnType<typeof buildAllTools>;

function buildAllTools(
  writer: UIMessageStreamWriter,
  params: BuiltinToolParams,
  ctx: MeshContext,
) {
  const {
    provider,
    organization,
    models,
    toolApprovalLevel = "readonly",
    toolOutputMap,
    passthroughClient,
    imageConfig,
  } = params;
  const tools = {
    user_ask: userAskTool,
    propose_plan: proposePlanTool,
    subtask: createSubtaskTool(
      writer,
      {
        provider,
        organization,
        models,
        needsApproval: toolNeedsApproval(toolApprovalLevel, false) !== false,
      },
      ctx,
    ),
    agent_search: createAgentSearchTool(
      writer,
      {
        organization,
        needsApproval: toolNeedsApproval(toolApprovalLevel, true) !== false,
      },
      ctx,
    ),
    read_tool_output: createReadToolOutputTool({
      toolOutputMap,
    }),
    sandbox: createSandboxTool({
      passthroughClient,
      toolOutputMap,
      needsApproval: toolNeedsApproval(toolApprovalLevel, false) !== false,
    }),
    read_resource: createReadResourceTool({
      passthroughClient,
      toolOutputMap,
    }),
    read_prompt: createReadPromptTool({
      passthroughClient,
      toolOutputMap,
    }),
  } as const;

  if (imageConfig && typeof provider.aiSdk.imageModel === "function") {
    return {
      ...tools,
      generate_image: createGenerateImageTool(
        writer,
        {
          provider,
          imageModelId: imageConfig.imageModelId,
          defaultAspectRatio: imageConfig.defaultAspectRatio,
          models,
          organizationId: imageConfig.organizationId,
          agentId: imageConfig.agentId,
          userId: imageConfig.userId,
          threadId: imageConfig.threadId,
        },
        ctx,
      ),
    } as const;
  }

  return tools;
}

/**
 * Get built-in tools as a ToolSet.
 * propose_plan is only included when toolApprovalLevel is "plan".
 */
export function getBuiltInTools(
  writer: UIMessageStreamWriter,
  params: BuiltinToolParams,
  ctx: MeshContext,
) {
  const tools = buildAllTools(writer, params, ctx);
  const { toolApprovalLevel = "readonly" } = params;

  if (toolApprovalLevel !== "plan") {
    const { propose_plan: _, ...rest } = tools;
    return rest;
  }

  return tools;
}
