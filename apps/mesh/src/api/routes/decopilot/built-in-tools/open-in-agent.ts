/**
 * open_in_agent Built-in Tool
 *
 * Creates a task (thread) in a target agent, saves the context as the
 * initial user message, and kicks off the agent run in the background.
 * Returns immediately with a taskId so the client can navigate to the
 * running task in the agent's UI.
 */

import type { MeshContext, OrganizationScope } from "@/core/mesh-context";
import { createVirtualClientFrom } from "@/mcp-clients/virtual-mcp";
import type { UIMessageStreamWriter } from "ai";
import { stepCountIs, streamText, tool, zodSchema } from "ai";
import { z } from "zod";
import {
  DEFAULT_MAX_TOKENS,
  SUBAGENT_EXCLUDED_TOOLS,
  SUBAGENT_STEP_LIMIT,
} from "../constants";
import { toolsFromMCP } from "../helpers";
import type { ModelsConfig } from "../types";
import type { MeshProvider } from "@/ai-providers/types";
import { createLanguageModel } from "../stream-core";

const OpenInAgentInputSchema = z.object({
  agent_id: z
    .string()
    .min(1)
    .max(128)
    .describe("The ID of the agent (Virtual MCP) to open."),
  context: z
    .string()
    .min(1)
    .max(50_000)
    .describe(
      "The context/task to forward to the agent. Include all relevant information " +
        "from the current conversation — the agent will start fresh with only this context.",
    ),
});

const description =
  "Open a task in another agent's UI. Use this when the user @mentions an agent " +
  "and wants to hand off work to that agent's specialized interface. " +
  "The user will see a clickable card to navigate to the agent.\n\n" +
  "Usage notes:\n" +
  "- Include full context (conversation summary, tool results, relevant data) in the context field.\n" +
  "- The agent starts fresh — it has no access to this conversation.\n" +
  "- This is NOT subtask — the work runs in the agent's own UI, not inline.";

export interface OpenInAgentParams {
  provider: MeshProvider;
  organization: OrganizationScope;
  userId: string;
  models: ModelsConfig;
  needsApproval?: boolean;
}

const ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

export function createOpenInAgentTool(
  writer: UIMessageStreamWriter,
  params: OpenInAgentParams,
  ctx: MeshContext,
) {
  const { provider, organization, userId, models, needsApproval } = params;

  return tool({
    description,
    inputSchema: zodSchema(OpenInAgentInputSchema),
    needsApproval,
    execute: async ({ agent_id, context }, options) => {
      const startTime = performance.now();
      try {
        // 1. Validate agent
        const virtualMcp = await ctx.storage.virtualMcps.findById(
          agent_id,
          organization.id,
        );

        if (!virtualMcp || virtualMcp.organization_id !== organization.id) {
          throw new Error("Agent not found");
        }

        if (virtualMcp.status !== "active") {
          throw new Error("Agent is not active");
        }

        // 2. Create thread
        if (!userId) {
          throw new Error("User ID is required to create a thread");
        }
        const taskId = crypto.randomUUID();
        await ctx.storage.threads.create({
          id: taskId,
          created_by: userId,
          virtual_mcp_id: agent_id,
        });

        // 3. Save user message to thread
        const now = new Date().toISOString();
        const userMessageId = crypto.randomUUID();
        await ctx.storage.threads.saveMessages([
          {
            id: userMessageId,
            thread_id: taskId,
            role: "user" as const,
            parts: [{ type: "text", text: context }],
            created_at: now,
            updated_at: now,
          },
        ]);

        // 4. Fire-and-forget: run the agent in the background
        runAgentInBackground({
          virtualMcp,
          taskId,
          context,
          provider,
          models,
          ctx,
        });

        return {
          success: true,
          agent_id: virtualMcp.id,
          agent_title: virtualMcp.title,
          task_id: taskId,
        };
      } finally {
        const latencyMs = performance.now() - startTime;
        writer.write({
          type: "data-tool-metadata",
          id: options.toolCallId,
          data: { annotations: ANNOTATIONS, latencyMs },
        });
      }
    },
  });
}

/**
 * Runs the target agent in the background. Does not block the parent.
 * Saves the assistant response to the thread when complete.
 */
function runAgentInBackground(params: {
  virtualMcp: NonNullable<
    Awaited<ReturnType<MeshContext["storage"]["virtualMcps"]["findById"]>>
  >;
  taskId: string;
  context: string;
  provider: MeshProvider;
  models: ModelsConfig;
  ctx: MeshContext;
}) {
  const { virtualMcp, taskId, context, provider, models, ctx } = params;

  // Use a no-op writer since we're not streaming to the parent
  const noopWriter = {
    write: () => {},
    merge: () => {},
  } as unknown as UIMessageStreamWriter;

  (async () => {
    try {
      const mcpClient = await createVirtualClientFrom(
        virtualMcp,
        ctx,
        "passthrough",
      );

      const { tools: mcpTools } = await toolsFromMCP(
        mcpClient,
        new Map(),
        noopWriter,
        "auto",
        { disableOutputTruncation: true },
      );

      const agentTools = Object.fromEntries(
        Object.entries(mcpTools).filter(
          ([name]) => !SUBAGENT_EXCLUDED_TOOLS.includes(name),
        ),
      );

      const serverInstructions = mcpClient.getInstructions();

      const result = streamText({
        model: createLanguageModel(provider, models.thinking),
        system: serverInstructions
          ? [{ role: "system" as const, content: serverInstructions }]
          : [],
        prompt: context,
        tools: agentTools,
        stopWhen: stepCountIs(SUBAGENT_STEP_LIMIT),
        maxOutputTokens:
          models.thinking.limits?.maxOutputTokens ?? DEFAULT_MAX_TOKENS,
        onError: (error) => {
          console.error(`[open_in_agent:${virtualMcp.id}] Error`, error);
        },
      });

      // Wait for completion and save assistant response
      const text = await result.text;
      const now = new Date().toISOString();
      await ctx.storage.threads.saveMessages([
        {
          id: crypto.randomUUID(),
          thread_id: taskId,
          role: "assistant" as const,
          parts: [{ type: "text", text }],
          created_at: now,
          updated_at: now,
        },
      ]);

      mcpClient.close().catch(() => {});
      console.log(
        `[open_in_agent] Completed task ${taskId} for agent ${virtualMcp.title}`,
      );
    } catch (error) {
      console.error(
        `[open_in_agent] Background run failed for task ${taskId}:`,
        error,
      );
    }
  })();
}
