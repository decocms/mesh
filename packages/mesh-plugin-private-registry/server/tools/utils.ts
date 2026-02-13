import type {
  ServerPluginToolContext,
  ServerPluginToolDefinition,
} from "@decocms/bindings/server-plugin";
import type { z } from "zod";
import { PLUGIN_ID } from "../../shared";
import type { PrivateRegistryPluginStorage } from "../storage";

let pluginStorage: PrivateRegistryPluginStorage | null = null;

export function setPluginStorage(storage: PrivateRegistryPluginStorage): void {
  pluginStorage = storage;
}

export function getPluginStorage(): PrivateRegistryPluginStorage {
  if (!pluginStorage) {
    throw new Error(
      `Plugin storage not initialized. Make sure the "${PLUGIN_ID}" plugin is enabled.`,
    );
  }
  return pluginStorage;
}

/** Context returned by requireOrgContext — organization is guaranteed non-null. */
export type OrgToolContext = ServerPluginToolContext & {
  organization: { id: string };
};

async function requireOrgContext(
  ctx: ServerPluginToolContext,
): Promise<OrgToolContext> {
  if (!ctx.organization) {
    throw new Error("Organization context required");
  }
  await ctx.access.check();
  return ctx as OrgToolContext;
}

/** Creates a typed handler that validates org context and casts input automatically. */
export function orgHandler<T extends z.ZodType>(
  _schema: T,
  fn: (input: z.infer<T>, ctx: OrgToolContext) => Promise<unknown>,
): ServerPluginToolDefinition["handler"] {
  return async (input, ctx) => {
    const orgCtx = await requireOrgContext(ctx);
    return fn(input as z.infer<T>, orgCtx);
  };
}
