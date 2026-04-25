/**
 * Decopilot Built-in Tools
 *
 * Client-side and server-side tools for decopilot agent interactions.
 * These use AI SDK tool() function and are registered directly in the decopilot API.
 */

import type { MeshContext, OrganizationScope } from "@/core/mesh-context";
import { posthog } from "@/posthog";
import type { UIMessageStreamWriter } from "ai";
import { toolNeedsApproval, type ToolApprovalLevel } from "../helpers";

// Known destructive/read-only classifications for built-in tools. Mirrors
// the MCP annotations used by passthrough tools so dashboards can filter
// uniformly across both sources.
const BUILTIN_TOOL_ANNOTATIONS: Record<
  string,
  { readOnly?: boolean; destructive?: boolean }
> = {
  agent_search: { readOnly: true, destructive: false },
  read_tool_output: { readOnly: true, destructive: false },
  read_resource: { readOnly: true, destructive: false },
  read_prompt: { readOnly: true, destructive: false },
  web_search: { readOnly: true, destructive: false },
  generate_image: { readOnly: false, destructive: false },
  open_in_agent: { readOnly: false, destructive: false },
  subtask: { readOnly: false, destructive: false },
  user_ask: { readOnly: true, destructive: false },
  propose_plan: { readOnly: true, destructive: false },
  enable_tools: { readOnly: true, destructive: false },
};
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
   * When set, VM file tools replace the QuickJS sandbox tool. Provisioning
   * already happened in `VM_START` — tools read the handle directly from
   * the vmMap entry.
   */
  activeVm?: ActiveVm | null;
}

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
  };
}

/**
 * Wrap each tool's execute() with a posthog tool_called capture so built-in
 * tool usage shows up in the same analytics pipeline as passthrough MCP
 * tools. Preserves the original tool shape so AI SDK can't tell the wrapper
 * is there.
 */
function instrumentBuiltIns<T extends Record<string, unknown>>(
  tools: T,
  params: BuiltinToolParams,
  ctx: MeshContext,
): T {
  const orgId = params.organization.id;
  const userId = ctx.auth?.user?.id;
  const result: Record<string, unknown> = {};
  for (const [name, tool] of Object.entries(tools)) {
    const t = tool as { execute?: Function; [k: string]: unknown };
    const originalExecute = t.execute;
    if (typeof originalExecute !== "function") {
      result[name] = tool;
      continue;
    }
    const hints = BUILTIN_TOOL_ANNOTATIONS[name];
    result[name] = {
      ...t,
      execute: async (input: unknown, options: unknown) => {
        const startTime = performance.now();
        let isError = false;
        try {
          return await originalExecute.call(t, input, options);
        } catch (err) {
          isError = true;
          throw err;
        } finally {
          const latencyMs = performance.now() - startTime;
          if (orgId && userId) {
            const automationId = ctx.metadata.automationId;
            posthog.capture({
              distinctId: automationId ? `automation_${automationId}` : userId,
              event: "tool_called",
              groups: { organization: orgId },
              properties: {
                organization_id: orgId,
                virtual_mcp_name: ctx.metadata.virtualMcpName ?? null,
                tool_source: "builtin",
                tool_name: name,
                tool_safe_name: name,
                read_only: hints?.readOnly ?? null,
                destructive: hints?.destructive ?? null,
                idempotent: null,
                open_world: null,
                latency_ms: Math.round(latencyMs),
                is_error: isError,
                trigger_id: ctx.metadata.triggerId ?? null,
                is_automation: !!automationId,
                automation_id: automationId ?? null,
                automation_name: ctx.metadata.automationName ?? null,
                user_id: userId,
              },
            });
          }
        }
      },
    };
  }
  return result as T;
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
  const raw = await buildAllTools(writer, params, ctx);
  const tools = instrumentBuiltIns(raw, params, ctx) as typeof raw;

  if (!params.isPlanMode) {
    const { propose_plan: _, ...rest } = tools;
    return rest;
  }

  return tools;
}
