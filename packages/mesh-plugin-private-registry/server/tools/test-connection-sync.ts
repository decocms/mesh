import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import {
  RegistryTestConnectionSyncInputSchema,
  RegistryTestConnectionSyncOutputSchema,
} from "./test-schemas";
import { ensureTestConnection } from "./test-run-start";
import { getPluginStorage } from "./utils";

export const REGISTRY_TEST_CONNECTION_SYNC: ServerPluginToolDefinition = {
  name: "REGISTRY_TEST_CONNECTION_SYNC",
  description:
    "Ensure every registry item has a dedicated test connection mapping for MCP tests",
  inputSchema: RegistryTestConnectionSyncInputSchema,
  outputSchema: RegistryTestConnectionSyncOutputSchema,
  handler: async (_input, ctx) => {
    RegistryTestConnectionSyncInputSchema.parse(_input);
    const meshCtx = ctx as {
      organization: { id: string } | null;
      access: { check: () => Promise<void> };
      user?: { id?: string };
      auth?: { user?: { id?: string } };
      storage: {
        connections: {
          create: (data: Record<string, unknown>) => Promise<{ id: string }>;
          findById: (
            id: string,
            organizationId?: string,
          ) => Promise<{ id: string } | null>;
        };
      };
    };
    if (!meshCtx.organization) {
      throw new Error("Organization context required");
    }
    await meshCtx.access.check();

    const storage = getPluginStorage();
    const list = await storage.items.list(meshCtx.organization.id, {});
    const before = await storage.testConnections.list(meshCtx.organization.id);
    const existingByItem = new Set(before.map((m) => m.item_id));

    let created = 0;
    for (const item of list.items) {
      if (!item.server.remotes?.some((r) => r.url)) continue;
      await ensureTestConnection(meshCtx as never, item);
      if (!existingByItem.has(item.id)) created += 1;
    }

    return {
      created,
      updated: Math.max(list.items.length - created, 0),
    };
  },
};
