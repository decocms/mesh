/**
 * Decopilot Built-in Tools
 *
 * Client-side and server-side tools for decopilot agent interactions.
 * These use AI SDK tool() function and are registered directly in the decopilot API.
 */

import type { MeshContext, OrganizationScope } from "@/core/mesh-context";
import type { UIMessageStreamWriter } from "ai";
import type { DockerSandboxRunner } from "mesh-plugin-user-sandbox/runner";
import { toolNeedsApproval, type ToolApprovalLevel } from "../helpers";
import { createAgentSearchTool } from "./agent-search";
import { createReadToolOutputTool } from "./read-tool-output";
import { createReadPromptTool } from "./prompts";
import { createReadResourceTool } from "./resources";
import { createSandboxTool, type VirtualClient } from "./sandbox";
import { createSandboxBashTool, type SandboxRepoRef } from "./sandbox-bash";
import { createVmTools } from "./vm-tools";
import { createOpenInAgentTool } from "./open-in-agent";
import { createSubtaskTool } from "./subtask";
import { userAskTool } from "./user-ask";
import { proposePlanTool } from "./propose-plan";
import { createGenerateImageTool } from "./generate-image";
import { createWebSearchTool } from "./web-search";
import type { ModelsConfig } from "../types";
import type { MeshProvider } from "@/ai-providers/types";

export interface BuiltinToolParams {
  /** Provider — null for Claude Code (subtask tool is omitted when null) */
  provider: MeshProvider | null;
  organization: OrganizationScope;
  models: ModelsConfig;
  userId: string;
  toolApprovalLevel?: ToolApprovalLevel;
  /** When true (chat mode `plan`), include `propose_plan` and plan-style approvals */
  isPlanMode?: boolean;
  toolOutputMap: Map<string, string>;
  passthroughClient: VirtualClient;
  /** When set, VM file tools replace the sandbox tool */
  activeVm?: { vmBaseUrl: string } | null;
  /**
   * Live Docker sandbox for this thread. When present, the same six VM file
   * tools that Freestyle registers (read/write/edit/grep/glob/bash) are
   * wired through `runner.proxyDaemonRequest` instead. Null when no live
   * container exists yet — falls back to sandbox + sandbox-bash (which can
   * lazy-provision on first call).
   */
  dockerVmSandbox?: {
    runner: DockerSandboxRunner;
    handle: string;
  } | null;
  /**
   * GitHub repo attached to the agent's Virtual MCP. When set, the Docker
   * sandbox clones it on first provisioning. Ignored when `activeVm` is set
   * (the Freestyle VM handles its own cloning).
   */
  sandboxRepo?: SandboxRepoRef | null;
  /**
   * Thread's `sandbox_ref` — identifies the shared Docker container for bash
   * and the preview iframe. Null for legacy threads that predate the column.
   */
  sandboxRef?: string | null;
}

/**
 * Full tool set type — always includes propose_plan so that ChatMessage
 * (derived via ReturnType) can render historical plan parts regardless
 * of the current chat mode.
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
    userId,
    toolApprovalLevel = "auto",
    isPlanMode = false,
    toolOutputMap,
    passthroughClient,
    activeVm,
    dockerVmSandbox,
    sandboxRepo,
    sandboxRef,
  } = params;
  const approvalOpts = { isPlanMode };
  const tools: Record<string, unknown> = {
    user_ask: userAskTool,
    propose_plan: proposePlanTool,
    agent_search: createAgentSearchTool(
      writer,
      {
        organization,
        needsApproval:
          toolNeedsApproval(toolApprovalLevel, true, approvalOpts) !== false,
      },
      ctx,
    ),
    read_tool_output: createReadToolOutputTool({
      toolOutputMap,
    }),
    read_resource: createReadResourceTool({
      passthroughClient,
      toolOutputMap,
      ctx,
    }),
    read_prompt: createReadPromptTool({
      passthroughClient,
      toolOutputMap,
    }),
    open_in_agent: createOpenInAgentTool(
      writer,
      {
        organization,
        userId,
        needsApproval:
          toolNeedsApproval(toolApprovalLevel, false, approvalOpts) !== false,
      },
      ctx,
    ),
  };
  // VM file tools replace sandbox + sandbox-bash when a live sandbox exists —
  // same six LLM-visible tools across runners (schemas in vm-tools/schemas.ts).
  // When neither runner has a handle at registry time, fall back to the
  // sandbox + sandbox-bash path which can lazy-provision on first call.
  const vmNeedsApproval =
    toolNeedsApproval(toolApprovalLevel, false, approvalOpts) !== false;
  if (activeVm) {
    Object.assign(
      tools,
      createVmTools({
        runner: "freestyle",
        vmBaseUrl: activeVm.vmBaseUrl,
        toolOutputMap,
        needsApproval: vmNeedsApproval,
      }),
    );
  } else if (dockerVmSandbox) {
    Object.assign(
      tools,
      createVmTools({
        runner: "docker",
        dockerRunner: dockerVmSandbox.runner,
        handle: dockerVmSandbox.handle,
        toolOutputMap,
        needsApproval: vmNeedsApproval,
      }),
    );
  } else {
    tools.sandbox = createSandboxTool({
      passthroughClient,
      toolOutputMap,
      needsApproval: vmNeedsApproval,
    });
    tools.bash = createSandboxBashTool(
      {
        needsApproval: vmNeedsApproval,
        toolOutputMap,
        repo: sandboxRepo ?? null,
        sandboxRef: sandboxRef ?? null,
      },
      ctx,
    );
  }
  // subtask requires a provider (LLM calls) — skip when provider is null (Claude Code)
  if (provider) {
    tools.subtask = createSubtaskTool(
      writer,
      {
        provider,
        organization,
        models,
        needsApproval:
          toolNeedsApproval(toolApprovalLevel, false, approvalOpts) !== false,
      },
      ctx,
    );
  }
  // generate_image requires a provider and an image model selection
  if (provider && models.image) {
    tools.generate_image = createGenerateImageTool(writer, {
      provider,
      imageModelInfo: models.image,
      ctx,
    });
  }
  // web_search requires a provider and a deep-research model
  if (provider && models.deepResearch) {
    tools.web_search = createWebSearchTool(writer, {
      provider,
      deepResearchModelInfo: models.deepResearch,
      ctx,
      toolOutputMap,
    });
  }
  return tools as {
    user_ask: typeof userAskTool;
    propose_plan: typeof proposePlanTool;
    subtask: ReturnType<typeof createSubtaskTool>;
    agent_search: ReturnType<typeof createAgentSearchTool>;
    read_tool_output: ReturnType<typeof createReadToolOutputTool>;
    sandbox: ReturnType<typeof createSandboxTool>;
    bash: ReturnType<typeof createSandboxBashTool>;
    read_resource: ReturnType<typeof createReadResourceTool>;
    read_prompt: ReturnType<typeof createReadPromptTool>;
    open_in_agent: ReturnType<typeof createOpenInAgentTool>;
    generate_image: ReturnType<typeof createGenerateImageTool>;
    web_search: ReturnType<typeof createWebSearchTool>;
  };
}

/**
 * Get built-in tools as a ToolSet.
 * propose_plan is only included when chat mode is `plan`.
 */
export function getBuiltInTools(
  writer: UIMessageStreamWriter,
  params: BuiltinToolParams,
  ctx: MeshContext,
) {
  const tools = buildAllTools(writer, params, ctx);

  if (!params.isPlanMode) {
    const { propose_plan: _, ...rest } = tools;
    return rest;
  }

  return tools;
}
