/**
 * agent_search Built-in Tool
 *
 * Server-side tool for discovering agents (Virtual MCPs) configured in the organization.
 * Used by decopilot to find specialized agents before delegating work with subtask_run.
 */

import type { MeshContext, OrganizationScope } from "@/core/mesh-context";
import type { UIMessageStreamWriter } from "ai";
import { tool, zodSchema } from "ai";
import { z } from "zod";

/**
 * Input schema for agent_search (Zod)
 * Exported for testing and type inference
 */
const AgentSearchInputSchema = z.object({
  search_term: z
    .string()
    .optional()
    .describe(
      "Optional search term to filter agents by name, title, or description. " +
        "Leave empty to return all available agents.",
    ),
});

/**
 * Output schema for agent_search (Zod)
 */
const AgentSearchOutputSchema = z.object({
  agents: z.array(
    z.object({
      agent_id: z.string().describe("Unique identifier for the agent"),
      name: z.string().describe("Human-readable agent name"),
      purpose: z
        .string()
        .nullable()
        .describe("What the agent is designed to do"),
      capabilities: z
        .array(z.string())
        .describe("List of capabilities the agent has"),
    }),
  ),
});

const description =
  "Search for agents configured in the organization. Returns agent metadata including purpose " +
  "and capabilities. Use this to discover specialized agents before delegating work with subtask_run.";

export interface AgentSearchParams {
  organization: OrganizationScope;
  needsApproval?: boolean;
}

const AGENT_SEARCH_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

/**
 * agent_search tool definition (AI SDK)
 *
 * This is a SERVER-SIDE tool - it has an execute function that queries
 * the database for Virtual MCPs and returns agent metadata.
 */
export function createAgentSearchTool(
  writer: UIMessageStreamWriter,
  params: AgentSearchParams,
  ctx: MeshContext,
) {
  const { organization, needsApproval } = params;

  return tool({
    description,
    inputSchema: zodSchema(AgentSearchInputSchema),
    outputSchema: zodSchema(AgentSearchOutputSchema),
    needsApproval,
    execute: async ({ search_term }, options) => {
      const startTime = performance.now();
      try {
        // Fetch all Virtual MCPs for the organization
        const virtualMcps = await ctx.storage.virtualMcps.list(organization.id);

        // Filter by search term if provided (case-insensitive)
        let filteredAgents = virtualMcps.filter(
          (vmc) => vmc.status === "active",
        );

        if (search_term && search_term.trim().length > 0) {
          const searchLower = search_term.toLowerCase();
          filteredAgents = filteredAgents.filter((vmc) => {
            const titleMatch = vmc.title.toLowerCase().includes(searchLower);
            const descriptionMatch =
              vmc.description?.toLowerCase().includes(searchLower) ?? false;
            return titleMatch || descriptionMatch;
          });
        }

        // Map to agent metadata format
        const agents = filteredAgents.map((vmc) => ({
          agent_id: vmc.id,
          name: vmc.title,
          purpose: vmc.description,
          capabilities: [] as string[], // Simplified for now, can enhance later
        }));

        return { agents };
      } finally {
        const latencyMs = performance.now() - startTime;
        writer.write({
          type: "data-tool-metadata",
          id: options.toolCallId,
          data: { annotations: AGENT_SEARCH_ANNOTATIONS, latencyMs },
        });
      }
    },
  });
}
