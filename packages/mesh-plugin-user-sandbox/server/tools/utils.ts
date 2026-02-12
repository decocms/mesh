/**
 * User Sandbox Plugin - Tool Utilities
 */

import type { ServerPluginToolContext } from "@decocms/bindings/server-plugin";
import type { z } from "zod";
import type { UserSandboxPluginStorage } from "../storage";
import { PLUGIN_ID } from "../../shared";

let pluginStorage: UserSandboxPluginStorage | null = null;

export function setPluginStorage(storage: UserSandboxPluginStorage): void {
  pluginStorage = storage;
}

export function getPluginStorage(): UserSandboxPluginStorage {
  if (!pluginStorage) {
    throw new Error(
      `Plugin storage not initialized. Make sure the "${PLUGIN_ID}" plugin is enabled.`,
    );
  }
  return pluginStorage;
}

export function getConnectBaseUrl(): string {
  return process.env.BASE_URL || "http://localhost:3000";
}

/** Context returned after requireOrgContext — organization is guaranteed non-null. */
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

/**
 * Helper to create a tool handler that requires organization context
 * and validates input against a Zod schema.
 */
export function orgHandler<TInput extends z.ZodType, TOutput>(
  inputSchema: TInput,
  handler: (input: z.infer<TInput>, ctx: OrgToolContext) => Promise<TOutput>,
) {
  return async (input: unknown, ctx: ServerPluginToolContext) => {
    const orgCtx = await requireOrgContext(ctx);
    const typedInput = inputSchema.parse(input);
    return handler(typedInput, orgCtx);
  };
}
