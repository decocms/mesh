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
import { createToolCaller } from "../../../tools/client";
import { KEYS } from "../../lib/query-keys";

/**
 * Hook to get organization settings
 *
 * @param organizationId - The ID of the organization
 * @returns Suspense query result with organization settings
 */
export function useOrganizationSettings(organizationId: string) {
  const toolCaller = createToolCaller();

  const { data } = useSuspenseQuery({
    queryKey: KEYS.organizationSettings(organizationId),
    queryFn: async () => {
      const settings = (await toolCaller(
        "ORGANIZATION_SETTINGS_GET",
        {},
      )) as OrganizationSettings | null;

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
  const toolCaller = createToolCaller();

  const update = useMutation({
    mutationFn: async (
      updates: Partial<
        Pick<OrganizationSettings, "sidebar_items" | "enabled_plugins">
      >,
    ) => {
      const settings = (await toolCaller("ORGANIZATION_SETTINGS_UPDATE", {
        organizationId,
        ...updates,
      })) as OrganizationSettings;

      return settings;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: KEYS.organizationSettings(organizationId),
      });
    },
  });

  return {
    update,
  };
}

// Re-export OrganizationSettings type for convenience
export type { OrganizationSettings };
