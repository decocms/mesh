import { useVirtualMCPs, type UseVirtualMCPsOptions } from "@decocms/mesh-sdk";

/**
 * Hook to fetch pinned virtual MCPs (projects).
 * Migration 052-spaces replaced the `subtype` column with a `pinned` boolean.
 */
export function useProjects(options: UseVirtualMCPsOptions = {}) {
  return useVirtualMCPs({
    ...options,
    filters: [...(options.filters ?? []), { column: "pinned", value: true }],
  });
}
