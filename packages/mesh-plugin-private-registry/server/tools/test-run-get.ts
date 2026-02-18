import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import { z } from "zod";
import {
  RegistryTestRunGetInputSchema,
  RegistryTestRunGetOutputSchema,
} from "./test-schemas";
import { getPluginStorage } from "./utils";

export const REGISTRY_TEST_RUN_GET: ServerPluginToolDefinition = {
  name: "REGISTRY_TEST_RUN_GET",
  description: "Get details for one MCP registry test run",
  inputSchema: RegistryTestRunGetInputSchema,
  outputSchema: RegistryTestRunGetOutputSchema,
  handler: async (input, ctx) => {
    const typedInput = input as z.infer<typeof RegistryTestRunGetInputSchema>;
    const meshCtx = ctx as {
      organization: { id: string } | null;
      access: { check: () => Promise<void> };
    };
    if (!meshCtx.organization) {
      throw new Error("Organization context required");
    }
    await meshCtx.access.check();

    const storage = getPluginStorage();
    const run = await storage.testRuns.findById(
      meshCtx.organization.id,
      typedInput.runId,
    );
    return { run };
  },
};
