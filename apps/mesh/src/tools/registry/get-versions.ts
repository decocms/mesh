import { defineTool } from "@/core/define-tool";
import { requireOrganization } from "@/core/mesh-context";
import {
  RegistryGetVersionsInputSchema,
  RegistryGetVersionsOutputSchema,
} from "./schema";
import {
  callRegistryTool,
  getEnabledRegistries,
  inferToolName,
  validateRegistryId,
} from "./registry-service";

export const REGISTRY_GET_VERSIONS = defineTool({
  name: "REGISTRY_GET_VERSIONS",
  description:
    "Get available versions for an MCP server in a registry. Returns version history with timestamps and changelogs.",
  inputSchema: RegistryGetVersionsInputSchema,
  outputSchema: RegistryGetVersionsOutputSchema,
  annotations: {
    title: "Get Registry Item Versions",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  handler: async (input, ctx) => {
    await ctx.access.check();
    const org = requireOrganization(ctx);

    const enabledRegistries = await getEnabledRegistries(ctx);
    validateRegistryId(input.registryId, enabledRegistries);

    const toolName = inferToolName(input.registryId, org.id, "VERSIONS");
    const result = await callRegistryTool(ctx, input.registryId, toolName, {
      id: input.itemId,
    });

    // Normalize the versions response
    const data = result as Record<string, unknown> | null;
    const rawVersions = Array.isArray(data?.versions) ? data.versions : [];

    const versions = rawVersions.map((v: unknown) => {
      if (!v || typeof v !== "object") {
        return { version: "", createdAt: null, changelog: null };
      }
      const ver = v as Record<string, unknown>;
      return {
        version: String(ver.version ?? ver.id ?? ""),
        createdAt:
          typeof ver.createdAt === "string"
            ? ver.createdAt
            : typeof ver.created_at === "string"
              ? ver.created_at
              : typeof ver.publishedAt === "string"
                ? ver.publishedAt
                : null,
        changelog: typeof ver.changelog === "string" ? ver.changelog : null,
      };
    });

    return { versions };
  },
});
