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

export interface MeshToolContext {
  organization: { id: string };
  access: { check: () => Promise<void> };
  user?: { id?: string };
  createMCPProxy: (connectionId: string) => Promise<{
    callTool: (args: {
      name: string;
      arguments?: Record<string, unknown>;
    }) => Promise<{
      isError?: boolean;
      content?: Array<{ type?: string; text?: string }>;
      structuredContent?: unknown;
    }>;
    close?: () => Promise<void>;
  }>;
}

export async function requireOrgContext(
  ctx: unknown,
): Promise<MeshToolContext> {
  const meshCtx = ctx as {
    organization: { id: string } | null;
    access: { check: () => Promise<void> };
    user?: { id?: string };
    createMCPProxy?: MeshToolContext["createMCPProxy"];
  };
  if (!meshCtx.organization) {
    throw new Error("Organization context required");
  }
  await meshCtx.access.check();
  return meshCtx as MeshToolContext;
}
