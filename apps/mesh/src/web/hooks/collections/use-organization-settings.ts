/**
 * Organization Settings Collection Hooks
 *
 * Provides React hooks for working with organization settings using TanStack DB collections
 * and live queries. This is a single-result collection (one settings per organization).
 */

import { type Collection, createCollection, eq } from "@tanstack/db";
import { useLiveSuspenseQuery } from "@tanstack/react-db";
import type { OrganizationSettings } from "../../../storage/types";
import { createToolCaller } from "../../../tools/client";
import { createCollectionWithSync } from "../create-collection-with-sync";

/**
 * Creates the organization settings collection for a specific organization
 *
 * @param organizationId - The ID of the organization
 * @returns A TanStack DB collection instance for organization settings
 */
function createOrganizationSettingsCollection(
  organizationId: string,
): Collection<OrganizationSettings, string> {
  const toolCaller = createToolCaller();

  // Use type assertion to satisfy the { id: string } constraint
  // We use getKey to extract organizationId as the key, so id is not actually needed
  const collectionConfig = createCollectionWithSync<
    OrganizationSettings,
    string
  >({
    id: `organization-settings-${organizationId}`,
    singleResult: true,
    getKey: (item) => item.organizationId,

    sync: {
      rowUpdateMode: "full",
      sync: ({ begin, write, commit, markReady }) => {
        let isActive = true;

        async function initialSync() {
          try {
            const settings = (await toolCaller(
              "ORGANIZATION_SETTINGS_GET",
              {},
            )) as OrganizationSettings | null;

            if (!isActive) {
              return;
            }

            begin();
            if (settings) {
              write({
                type: "insert",
                value: settings as OrganizationSettings & { id: string },
              });
            } else {
              // Create default settings if none exist
              const defaultSettings: OrganizationSettings = {
                organizationId,
                sidebar_items: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };
              write({
                type: "insert",
                value: defaultSettings as OrganizationSettings & { id: string },
              });
            }
            commit();
          } catch (error) {
            console.error(
              "Initial sync failed for organization settings:",
              error,
            );
          } finally {
            markReady();
          }
        }

        initialSync();

        // Return cleanup function
        return () => {
          isActive = false;
        };
      },
    },

    // Persistence handler for updates (inserts are treated as updates since singleResult)
    onUpdate: async ({ transaction }) => {
      const toolCaller = createToolCaller();
      const mutation = transaction.mutations[0];
      if (!mutation) {
        return [];
      }

      const { modified } = mutation;
      const updateData: Partial<Pick<OrganizationSettings, "sidebar_items">> = {
        sidebar_items: modified.sidebar_items,
      };

      const settings = (await toolCaller("ORGANIZATION_SETTINGS_UPDATE", {
        organizationId,
        ...updateData,
      })) as OrganizationSettings;

      return [settings as OrganizationSettings & { id: string }];
    },

    // Persistence handler for inserts (treat as update since singleResult)
    onInsert: async ({ transaction }) => {
      const toolCaller = createToolCaller();
      const mutation = transaction.mutations[0];
      if (!mutation) {
        return [];
      }

      const { modified } = mutation;
      const updateData: Partial<Pick<OrganizationSettings, "sidebar_items">> = {
        sidebar_items: modified.sidebar_items,
      };

      const settings = (await toolCaller("ORGANIZATION_SETTINGS_UPDATE", {
        organizationId,
        ...updateData,
      })) as OrganizationSettings;

      return [settings as OrganizationSettings & { id: string }];
    },
  });

  return createCollection<OrganizationSettings, string>(
    collectionConfig as unknown as Parameters<
      typeof createCollection<OrganizationSettings, string>
    >[0],
  );
}

// Single instance cache for collection
const collectionCache = {
  key: "",
  value: null as Collection<OrganizationSettings, string> | null,
};

/**
 * Get or create an organization settings collection instance for a specific organization.
 * Collections are cached to ensure singleton-like behavior per organization.
 * When the organizationId changes, the collection is recreated.
 *
 * @param organizationId - The ID of the organization
 * @returns A TanStack DB collection instance for organization settings
 */
export function getOrganizationSettingsCollection(
  organizationId: string,
): Collection<OrganizationSettings, string> {
  const key = organizationId;

  if (collectionCache.key !== key) {
    collectionCache.key = key;
    collectionCache.value =
      createOrganizationSettingsCollection(organizationId);
  }

  return collectionCache.value!;
}

// Re-export OrganizationSettings type for convenience
export type { OrganizationSettings };

/**
 * Hook to get organization settings with live query reactivity
 *
 * @param organizationId - The ID of the organization
 * @returns Live query result with organization settings
 */
export function useOrganizationSettings(organizationId: string) {
  const collection = getOrganizationSettingsCollection(organizationId);

  const { data } = useLiveSuspenseQuery(
    (q) => {
      return q
        .from({ settings: collection })
        .where(
          ({ settings }) =>
            settings && eq(settings.organizationId, organizationId),
        )
        .findOne();
    },
    [organizationId, collection],
  );

  return data;
}
