import { useQueryClient } from "@tanstack/react-query";
import { useProjectContext } from "@decocms/mesh-sdk";

/**
 * Returns a function that invalidates all VIRTUAL_MCP collection queries
 * for the current org. Replaces copy-pasted invalidation logic across
 * FreestylePlayButton, GitHubTabContent, and other freestyle UI components.
 */
export function useInvalidateVirtualMcp() {
  const queryClient = useQueryClient();
  const { org } = useProjectContext();

  return () => {
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey;
        return (
          key[1] === org.id &&
          key[3] === "collection" &&
          key[4] === "VIRTUAL_MCP"
        );
      },
    });
  };
}
