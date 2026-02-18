import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import {
  RegistryTestConnectionUpdateAuthInputSchema,
  RegistryTestConnectionUpdateAuthOutputSchema,
} from "./test-schemas";
import { getPluginStorage } from "./utils";

export const REGISTRY_TEST_CONNECTION_UPDATE_AUTH: ServerPluginToolDefinition =
  {
    name: "REGISTRY_TEST_CONNECTION_UPDATE_AUTH",
    description:
      "Update the auth_status of a test connection mapping (by core connection ID)",
    inputSchema: RegistryTestConnectionUpdateAuthInputSchema,
    outputSchema: RegistryTestConnectionUpdateAuthOutputSchema,
    handler: async (input, ctx) => {
      const { connectionId, authStatus } =
        RegistryTestConnectionUpdateAuthInputSchema.parse(input);
      const meshCtx = ctx as {
        organization: { id: string } | null;
        access: { check: () => Promise<void> };
      };
      if (!meshCtx.organization) {
        throw new Error("Organization context required");
      }
      await meshCtx.access.check();

      const storage = getPluginStorage();
      const orgId = meshCtx.organization.id;

      // Find the mapping by connection_id
      const all = await storage.testConnections.list(orgId);
      const mapping = all.find((m) => m.connection_id === connectionId);
      if (!mapping) {
        throw new Error(
          `No test connection mapping found for connection ${connectionId}`,
        );
      }

      await storage.testConnections.updateAuthStatus(
        orgId,
        mapping.item_id,
        authStatus,
      );

      return { success: true };
    },
  };
