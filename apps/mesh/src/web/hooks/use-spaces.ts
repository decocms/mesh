import { useVirtualMCPs, type UseVirtualMCPsOptions } from "@decocms/mesh-sdk";

export function useSpaces(
  options: UseVirtualMCPsOptions & { pinnedOnly?: boolean } = {},
) {
  const { pinnedOnly, ...rest } = options;
  return useVirtualMCPs({
    ...rest,
    filters: [
      ...(rest.filters ?? []),
      ...(pinnedOnly ? [{ column: "pinned", value: true }] : []),
    ],
  });
}
