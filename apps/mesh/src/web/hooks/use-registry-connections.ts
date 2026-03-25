/**
 * Hook to get registry connections without expensive binding-based tool enumeration.
 *
 * Derives known registry IDs from:
 * 1. Well-known Deco Store (always included)
 * 2. Any registries explicitly listed in registry_config (community, private, etc.)
 *
 * This replaces `useConnections({ binding: "REGISTRY" })` which had to call
 * listTools() on every MCP server just to find registries.
 */

import {
  useConnections,
  useProjectContext,
  WellKnownOrgMCPId,
} from "@decocms/mesh-sdk";
import { useRegistrySettings } from "./use-registry-settings";

export function useRegistryConnections() {
  const { org } = useProjectContext();
  const { registryConfig } = useRegistrySettings();

  // Deco Store is always a known registry
  const decoStoreId = WellKnownOrgMCPId.REGISTRY(org.id);
  const registryIds = new Set<string>([decoStoreId]);

  // Add any registries from registry_config (community, private, etc.)
  if (registryConfig?.registries) {
    for (const id of Object.keys(registryConfig.registries)) {
      registryIds.add(id);
    }
  }

  // Fetch all connections (no binding filter = no tool enumeration)
  const allConnections = useConnections();

  return allConnections.filter((c) => registryIds.has(c.id));
}
