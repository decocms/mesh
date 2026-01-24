/**
 * User Sandbox Plugin - Storage Index
 *
 * Exports all storage components and the factory function.
 */

import type { Kysely } from "kysely";
import type { ServerPluginContext } from "@decocms/bindings/server-plugin";
import { UserSandboxStorage } from "./user-sandbox";
import { UserSandboxSessionStorage } from "./user-sandbox-session";
import type { UserSandboxDatabase } from "./types";
import { setPluginStorage } from "../tools/utils";

export * from "./types";

/**
 * Combined storage interface for the plugin
 */
export interface UserSandboxPluginStorage {
  templates: UserSandboxStorage;
  sessions: UserSandboxSessionStorage;
}

/**
 * Create the storage instance for the plugin.
 * Called by the plugin loader during initialization.
 * Also registers the storage for use by tools via setPluginStorage.
 */
export function createStorage(
  ctx: ServerPluginContext,
): UserSandboxPluginStorage {
  const db = ctx.db as Kysely<UserSandboxDatabase>;

  const storage: UserSandboxPluginStorage = {
    templates: new UserSandboxStorage(db),
    sessions: new UserSandboxSessionStorage(db),
  };

  // Register storage for tools to access
  setPluginStorage(storage);

  return storage;
}
