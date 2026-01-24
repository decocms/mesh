/**
 * Gateway Templates Plugin - Storage Index
 *
 * Exports all storage components and the factory function.
 */

import type { Kysely } from "kysely";
import type { ServerPluginContext } from "@decocms/bindings/server-plugin";
import { GatewayTemplateStorage } from "./gateway-template";
import { GatewayTemplateSessionStorage } from "./gateway-template-session";
import type { GatewayTemplatesDatabase } from "./types";
import { setPluginStorage } from "../tools/utils";

export { GatewayTemplateStorage } from "./gateway-template";
export { GatewayTemplateSessionStorage } from "./gateway-template-session";
export * from "./types";

/**
 * Combined storage interface for the plugin
 */
export interface GatewayTemplatesStorage {
  templates: GatewayTemplateStorage;
  sessions: GatewayTemplateSessionStorage;
}

/**
 * Create the storage instance for the plugin.
 * Called by the plugin loader during initialization.
 * Also registers the storage for use by tools via setPluginStorage.
 */
export function createStorage(
  ctx: ServerPluginContext,
): GatewayTemplatesStorage {
  const db = ctx.db as Kysely<GatewayTemplatesDatabase>;

  const storage: GatewayTemplatesStorage = {
    templates: new GatewayTemplateStorage(db),
    sessions: new GatewayTemplateSessionStorage(db),
  };

  // Register storage for tools to access
  setPluginStorage(storage);

  return storage;
}
