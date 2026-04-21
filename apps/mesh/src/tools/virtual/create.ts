/**
 * COLLECTION_VIRTUAL_MCP_CREATE Tool
 *
 * Create a new MCP virtual MCP (organization-scoped) with collection binding compliance.
 * Note: Virtual MCPs are stored as connections with connection_type = 'VIRTUAL',
 * so creating a Virtual MCP automatically creates the connection.
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import {
  getUserId,
  requireAuth,
  requireOrganization,
} from "../../core/mesh-context";
import { VirtualMCPCreateDataSchema, VirtualMCPEntitySchema } from "./schema";
import { enqueuePrepForRepoLink } from "../../sandbox/prep-enqueue";
/**
 * Random icon+color for new agents (server-side, no React deps).
 * Uses the same icon:// format as the client-side agent-icon module.
 */
const ICON_COLORS = [
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
];
const ICON_NAMES = [
  "Star01",
  "Zap",
  "Heart",
  "Globe01",
  "Compass03",
  "Lightbulb02",
  "Rocket01",
  "Flag01",
  "BookOpen01",
  "Shield01",
  "Key01",
  "Diamond01",
  "Cube01",
  "Target04",
  "Award01",
  "Briefcase01",
  "Coffee",
  "Feather",
  "Hexagon01",
  "Layers3_01",
  "Map01",
  "Palette",
  "Package",
  "Terminal",
];
function pickRandomAgentIcon(): string {
  const color = ICON_COLORS[Math.floor(Math.random() * ICON_COLORS.length)]!;
  const icon = ICON_NAMES[Math.floor(Math.random() * ICON_NAMES.length)]!;
  return `icon://${icon}?color=${color}`;
}

/**
 * Input schema for creating virtual MCPs (wrapped in data field for collection compliance)
 */
const CreateInputSchema = z.object({
  data: VirtualMCPCreateDataSchema.describe("Data for the new virtual MCP"),
});

export type CreateVirtualMCPInput = z.infer<typeof CreateInputSchema>;

/**
 * Output schema for created virtual MCP
 */
const CreateOutputSchema = z.object({
  item: VirtualMCPEntitySchema.describe("The created virtual MCP entity"),
});

export const COLLECTION_VIRTUAL_MCP_CREATE = defineTool({
  name: "COLLECTION_VIRTUAL_MCP_CREATE",
  description:
    "Create a Virtual MCP that aggregates tools from multiple connections into one endpoint.",
  annotations: {
    title: "Create Virtual MCP",
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
  inputSchema: CreateInputSchema,
  outputSchema: CreateOutputSchema,

  handler: async (input, ctx) => {
    requireAuth(ctx);
    const organization = requireOrganization(ctx);

    await ctx.access.check();

    const userId = getUserId(ctx);
    if (!userId) {
      throw new Error("User ID required to create virtual MCP");
    }

    // Create the virtual MCP (input.data is already in the correct format)
    // Note: The facade creates a VIRTUAL connection in the connections table
    // Use a random icon+color if no icon is provided
    const dataWithIcon = {
      ...input.data,
      icon: input.data.icon ?? pickRandomAgentIcon(),
    };

    const virtualMcp = await ctx.storage.virtualMcps.create(
      organization.id,
      userId,
      dataWithIcon,
    );

    // Repo was linked at create time — fire a background bake so the
    // Docker sandbox for the first thread spawns from a pre-baked image.
    const metadata = (dataWithIcon.metadata ?? {}) as {
      githubRepo?: {
        owner?: string;
        name?: string;
        connectionId?: string;
      } | null;
    };
    if (
      metadata.githubRepo?.owner &&
      metadata.githubRepo.name &&
      metadata.githubRepo.connectionId
    ) {
      enqueuePrepForRepoLink(ctx, userId, {
        owner: metadata.githubRepo.owner,
        name: metadata.githubRepo.name,
        connectionId: metadata.githubRepo.connectionId,
      });
    }

    // Return virtual MCP entity directly (already in correct format)
    return {
      item: virtualMcp,
    };
  },
});
