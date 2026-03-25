import { useVirtualMCPs, type UseVirtualMCPsOptions } from "@decocms/mesh-sdk";

/**
 * Hook to fetch only project virtual MCPs (subtype = "project").
 * Mirrors the useAgents() pattern for agent-scoped data.
 */
export function useProjects(
  options: UseVirtualMCPsOptions & { pinnedOnly?: boolean } = {},
) {
  const { pinnedOnly, ...rest } = options;
  return useVirtualMCPs({
    ...rest,
    filters: [
      ...(rest.filters ?? []),
      { column: "subtype", value: "project" },
      ...(pinnedOnly ? [{ column: "pinned", value: true }] : []),
    ],
  });
}
