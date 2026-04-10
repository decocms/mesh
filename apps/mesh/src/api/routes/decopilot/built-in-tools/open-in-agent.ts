/**
 * open_in_agent Built-in Tool
 *
 * Validates the target agent and creates an empty thread (task).
 * Returns immediately with a taskId — the frontend starts the actual
 * agent run via the standard decopilot/stream endpoint.
 */

import type { MeshContext, OrganizationScope } from "@/core/mesh-context";
import type { UIMessageStreamWriter } from "ai";
import { tool, zodSchema } from "ai";
import { z } from "zod";

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
  organization: OrganizationScope;
  userId: string;
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
  const { organization, userId, needsApproval } = params;

  return tool({
    description,
    inputSchema: zodSchema(OpenInAgentInputSchema),
    needsApproval,
    execute: async ({ agent_id }, options) => {
      const startTime = performance.now();
      try {
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

        if (!userId) {
          throw new Error("User ID is required to create a thread");
        }

        const taskId = crypto.randomUUID();
        await ctx.storage.threads.create({
          id: taskId,
          created_by: userId,
          virtual_mcp_id: agent_id,
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
