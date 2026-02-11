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
