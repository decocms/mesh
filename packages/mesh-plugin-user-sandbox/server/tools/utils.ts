/**
 * User Sandbox Plugin - Tool Utilities
 */

import type { UserSandboxPluginStorage } from "../storage";
import { PLUGIN_ID } from "../../shared";

// This will be set by the plugin loader when storage is initialized
let pluginStorage: UserSandboxPluginStorage | null = null;

/**
 * Set the plugin storage instance.
 * Called by the main app when plugin storage is initialized.
 */
export function setPluginStorage(storage: UserSandboxPluginStorage): void {
  pluginStorage = storage;
}

/**
 * Get the plugin storage instance.
 * Throws if storage hasn't been initialized.
 */
export function getPluginStorage(): UserSandboxPluginStorage {
  if (!pluginStorage) {
    throw new Error(
      `Plugin storage not initialized. Make sure the "${PLUGIN_ID}" plugin is enabled.`,
    );
  }
  return pluginStorage;
}

/**
 * Get the base URL for connect flow.
 * Uses the origin from the request or falls back to env var.
 */
export function getConnectBaseUrl(): string {
  // In production, this should come from env or be derived from request
  return process.env.MESH_PUBLIC_URL || "http://localhost:3000";
}
