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
import { createVmTools } from "./vm-tools";
import { getRunnerByKind } from "@/sandbox/lifecycle";
import type { RunnerKind } from "mesh-plugin-user-sandbox/runner";
import { createSubtaskTool } from "./subtask";
import { userAskTool } from "./user-ask";
import { proposePlanTool } from "./propose-plan";
import { createGenerateImageTool } from "./generate-image";
import { createWebSearchTool } from "./web-search";
import { createTakeScreenshotTool, type PendingImage } from "./take-screenshot";
import { createScrapeUrlTool } from "./scrape-url";
import type { ModelsConfig } from "../types";
import type { MeshProvider } from "@/ai-providers/types";

export type ActiveVm = {
  runnerKind: RunnerKind;
  vmId: string;
};

export interface BuiltinToolParams {
  /** Provider — null for Claude Code (subtask tool is omitted when null) */
  provider: MeshProvider | null;
  organization: OrganizationScope;
  models: ModelsConfig;
  toolApprovalLevel?: ToolApprovalLevel;
  /** When true (chat mode `plan`), include `propose_plan` and plan-style approvals */
  isPlanMode?: boolean;
  toolOutputMap: Map<string, string>;
  passthroughClient: VirtualClient;
  /**
   * Images captured by take_screenshot, queued for injection as user
   * messages by prepareStep in stream-core.ts. This approach works
   * across all providers (including OpenRouter) since images in tool
   * result messages aren't universally supported.
   */
  pendingImages: PendingImage[];
  /**
   * When set, VM file tools replace the QuickJS sandbox tool. Provisioning
   * already happened in `VM_START` — tools read the handle directly from
   * the vmMap entry.
   */
  activeVm?: ActiveVm | null;
}

export type { PendingImage };

/**
 * Full tool set type — always includes propose_plan so that ChatMessage
 * (derived via ReturnType) can render historical plan parts regardless
 * of the current chat mode.
 */
export type BuiltInToolSet = Awaited<ReturnType<typeof buildAllTools>>;

async function buildAllTools(
  writer: UIMessageStreamWriter,
  params: BuiltinToolParams,
  ctx: MeshContext,
) {
  const {
    provider,
    organization,
    models,
    toolApprovalLevel = "auto",
    isPlanMode = false,
    toolOutputMap,
    pendingImages,
    passthroughClient,
    activeVm,
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
  };
  // VM file tools — same six LLM-visible tools across runners (schemas in
  // vm-tools/schemas.ts). Dispatch resolves through `getRunnerByKind` so
  // the entry's recorded runnerKind drives the routing, regardless of the
  // current MESH_SANDBOX_RUNNER env value. When no entry exists, fall back
  // to the QuickJS `sandbox` tool — VM_START must run first for file tools.
  const vmNeedsApproval =
    toolNeedsApproval(toolApprovalLevel, false, approvalOpts) !== false;
  if (activeVm) {
    const runner = await getRunnerByKind(ctx, activeVm.runnerKind);
    const { vmId } = activeVm;
    Object.assign(
      tools,
      createVmTools({
        runner,
        ensureHandle: () => Promise.resolve(vmId),
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
  // take_screenshot and scrape_url require Browserless API token
  if (process.env.BROWSERLESS_TOKEN) {
    tools.take_screenshot = createTakeScreenshotTool(writer, {
      ctx,
      toolOutputMap,
      pendingImages,
    });
    tools.scrape_url = createScrapeUrlTool(writer, {
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
    read_resource: ReturnType<typeof createReadResourceTool>;
    read_prompt: ReturnType<typeof createReadPromptTool>;
    generate_image: ReturnType<typeof createGenerateImageTool>;
    web_search: ReturnType<typeof createWebSearchTool>;
    take_screenshot: ReturnType<typeof createTakeScreenshotTool>;
    scrape_url: ReturnType<typeof createScrapeUrlTool>;
  };
}

/**
 * Get built-in tools as a ToolSet.
 * propose_plan is only included when chat mode is `plan`.
 */
export async function getBuiltInTools(
  writer: UIMessageStreamWriter,
  params: BuiltinToolParams,
  ctx: MeshContext,
) {
  const tools = await buildAllTools(writer, params, ctx);

  if (!params.isPlanMode) {
    const { propose_plan: _, ...rest } = tools;
    return rest;
  }

  return tools;
}
