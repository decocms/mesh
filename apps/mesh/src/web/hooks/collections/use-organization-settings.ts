/**
 * Organization Settings Hooks using React Query
 *
 * Provides React hooks for working with organization settings using React Query.
 * Uses tool calls to ORGANIZATION_SETTINGS_GET and ORGANIZATION_SETTINGS_UPDATE.
 */

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import type { OrganizationSettings } from "../../../storage/types";
import { KEYS } from "../../lib/query-keys";
import { useMCPClient, useProjectContext } from "@decocms/mesh-sdk";

/**
 * Hook to get organization settings
 *
 * @param organizationId - The ID of the organization
 * @returns Suspense query result with organization settings
 */
export function useOrganizationSettings(organizationId: string) {
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: null,
    orgSlug: org.slug,
  });

  const { data } = useSuspenseQuery({
    queryKey: KEYS.organizationSettings(organizationId),
    queryFn: async () => {
      const result = (await client.callTool({
        name: "ORGANIZATION_SETTINGS_GET",
        arguments: {},
      })) as { structuredContent?: unknown };
      const settings = (result.structuredContent ??
        result) as OrganizationSettings | null;

      // Return default settings if none exist
      if (!settings) {
        return {
          organizationId,
          sidebar_items: null,
          enabled_plugins: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as OrganizationSettings;
      }

      return settings;
    },
    staleTime: 60_000, // 1 minute
  });

  return data;
}

/**
 * Hook to get organization settings mutation actions
 *
 * @param organizationId - The ID of the organization
 * @returns Object with update mutation hook
 */
export function useOrganizationSettingsActions(organizationId: string) {
  const queryClient = useQueryClient();
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: null,
    orgSlug: org.slug,
  });

  const update = useMutation({
    mutationFn: async (
      updates: Partial<
        Pick<OrganizationSettings, "sidebar_items" | "enabled_plugins">
      >,
    ) => {
      const result = (await client.callTool({
        name: "ORGANIZATION_SETTINGS_UPDATE",
        arguments: {
          organizationId,
          ...updates,
        },
      })) as { structuredContent?: unknown };
      const settings = (result.structuredContent ??
        result) as OrganizationSettings;

      return settings;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(KEYS.organizationSettings(organizationId), data);
    },
  });

  return {
    update,
  };
}

// Re-export OrganizationSettings type for convenience
export type { OrganizationSettings };
