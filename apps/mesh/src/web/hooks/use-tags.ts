/**
 * Tags Hooks
 *
 * Provides React hooks for managing organization tags and member tag assignments.
 * Uses MCP tools for all operations.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useMCPClient,
  useProjectContext,
  SELF_MCP_ALIAS_ID,
} from "@decocms/mesh-sdk";
import { toast } from "sonner";

/**
 * Tag data structure
 */
export interface Tag {
  id: string;
  organizationId: string;
  name: string;
  createdAt: string;
}

// ============================================================================
// Query Keys
// ============================================================================

// Extend KEYS with tag-specific keys (local extension)
const TAG_KEYS = {
  tags: (locator: string) => [locator, "tags"] as const,
  memberTags: (locator: string, memberId: string) =>
    [locator, "member-tags", memberId] as const,
};

// ============================================================================
// Organization Tags Hooks
// ============================================================================

type TagsListOutput = { tags: Tag[] };
type TagCreateOutput = { tag: Tag };
type TagDeleteOutput = { success: boolean };

/**
 * Hook to fetch all organization tags
 */
export function useTags() {
  const { org, locator } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  return useQuery({
    queryKey: TAG_KEYS.tags(locator),
    queryFn: async () => {
      const result = (await client.callTool({
        name: "TAGS_LIST",
        arguments: {},
      })) as { structuredContent?: unknown };
      const payload = (result.structuredContent ?? result) as TagsListOutput;
      return payload.tags;
    },
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Hook to create a new tag
 */
export function useCreateTag() {
  const queryClient = useQueryClient();
  const { org, locator } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  return useMutation({
    mutationFn: async (name: string) => {
      const result = (await client.callTool({
        name: "TAGS_CREATE",
        arguments: { name },
      })) as { structuredContent?: unknown };
      const payload = (result.structuredContent ?? result) as TagCreateOutput;
      return payload.tag;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TAG_KEYS.tags(locator) });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to create tag",
      );
    },
  });
}

/**
 * Hook to delete a tag
 */
export function useDeleteTag() {
  const queryClient = useQueryClient();
  const { org, locator } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  return useMutation({
    mutationFn: async (tagId: string) => {
      const result = (await client.callTool({
        name: "TAGS_DELETE",
        arguments: { tagId },
      })) as { structuredContent?: unknown };
      const payload = (result.structuredContent ?? result) as TagDeleteOutput;
      return payload.success;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TAG_KEYS.tags(locator) });
      toast.success("Tag deleted");
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete tag",
      );
    },
  });
}

// ============================================================================
// Member Tags Hooks
// ============================================================================

type MemberTagsGetOutput = { tags: Tag[] };
type MemberTagsSetOutput = { success: boolean; tags: Tag[] };

/**
 * Hook to fetch tags for a specific member
 */
export function useMemberTags(memberId: string) {
  const { org, locator } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  return useQuery({
    queryKey: TAG_KEYS.memberTags(locator, memberId),
    queryFn: async () => {
      const result = (await client.callTool({
        name: "MEMBER_TAGS_GET",
        arguments: { memberId },
      })) as { structuredContent?: unknown };
      const payload = (result.structuredContent ??
        result) as MemberTagsGetOutput;
      return payload.tags;
    },
    staleTime: 30000, // 30 seconds
    enabled: !!memberId,
  });
}

/**
 * Hook to set tags for a member
 */
export function useSetMemberTags() {
  const queryClient = useQueryClient();
  const { org, locator } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  return useMutation({
    mutationFn: async ({
      memberId,
      tagIds,
    }: {
      memberId: string;
      tagIds: string[];
    }) => {
      const result = (await client.callTool({
        name: "MEMBER_TAGS_SET",
        arguments: { memberId, tagIds },
      })) as { structuredContent?: unknown };
      const payload = (result.structuredContent ??
        result) as MemberTagsSetOutput;
      return payload;
    },
    onSuccess: (_data, variables) => {
      // Invalidate the specific member's tags
      queryClient.invalidateQueries({
        queryKey: TAG_KEYS.memberTags(locator, variables.memberId),
      });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to update member tags",
      );
    },
  });
}

/**
 * Hook to prefetch member tags for multiple members at once
 * Useful for loading tag data before rendering a list
 */
export function usePrefetchMemberTags() {
  const queryClient = useQueryClient();
  const { org, locator } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  return async (memberIds: string[]) => {
    await Promise.all(
      memberIds.map((memberId) =>
        queryClient.prefetchQuery({
          queryKey: TAG_KEYS.memberTags(locator, memberId),
          queryFn: async () => {
            const result = (await client.callTool({
              name: "MEMBER_TAGS_GET",
              arguments: { memberId },
            })) as { structuredContent?: unknown };
            const payload = (result.structuredContent ??
              result) as MemberTagsGetOutput;
            return payload.tags;
          },
          staleTime: 30000,
        }),
      ),
    );
  };
}

// Export TAG_KEYS for use in components that need to invalidate queries
export { TAG_KEYS };
