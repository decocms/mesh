import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import { z } from "zod";
import {
  RegistryTestRunListInputSchema,
  RegistryTestRunListOutputSchema,
} from "./test-schemas";
import { getPluginStorage } from "./utils";

export const REGISTRY_TEST_RUN_LIST: ServerPluginToolDefinition = {
  name: "REGISTRY_TEST_RUN_LIST",
  description: "List MCP registry test runs",
  inputSchema: RegistryTestRunListInputSchema,
  outputSchema: RegistryTestRunListOutputSchema,
  handler: async (input, ctx) => {
    const typedInput = input as z.infer<typeof RegistryTestRunListInputSchema>;
    const meshCtx = ctx as {
      organization: { id: string } | null;
      access: { check: () => Promise<void> };
    };
    if (!meshCtx.organization) {
      throw new Error("Organization context required");
    }
    await meshCtx.access.check();

    const storage = getPluginStorage();
    return storage.testRuns.list(meshCtx.organization.id, typedInput);
  },
};
