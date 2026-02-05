/**
 * Allowed Models Hook
 *
 * Fetches the current user's model permissions from the server.
 * Returns which models the user is allowed to use, scoped by connection.
 */

import { KEYS } from "@/web/lib/query-keys";
import { useProjectContext } from "@decocms/mesh-sdk";
import { useQuery } from "@tanstack/react-query";

export interface AllowedModelsResponse {
  allowAll: boolean;
  models: Record<string, string[]>;
}

/**
 * Hook to fetch the current user's allowed models.
 *
 * @returns { allowAll, models, isLoading }
 *   - allowAll: true if user can use all models (admin/owner or no restrictions)
 *   - models: connection-scoped map of allowed model IDs
 *   - isModelAllowed: helper to check if a specific model is allowed
 */
export function useAllowedModels() {
  const { locator, org } = useProjectContext();

  const { data, isLoading } = useQuery({
    queryKey: KEYS.allowedModels(locator),
    queryFn: async (): Promise<AllowedModelsResponse> => {
      const response = await fetch(
        `/api/${org.slug}/decopilot/allowed-models`,
        { credentials: "include" },
      );
      if (!response.ok) {
        // If the endpoint fails, default to allowing all models
        return { allowAll: true, models: {} };
      }
      return response.json();
    },
    staleTime: 30_000, // Cache for 30 seconds
  });

  const allowAll = data?.allowAll ?? true;
  const models = data?.models ?? {};

  const isModelAllowed = (connectionId: string, modelId: string): boolean => {
    if (allowAll) return true;
    const connModels = models[connectionId];
    if (!connModels) {
      // Check wildcard connection
      const wildcard = models["*"];
      return wildcard?.includes("*") ?? false;
    }
    return connModels.includes("*") || connModels.includes(modelId);
  };

  return {
    allowAll,
    models,
    isLoading,
    isModelAllowed,
  };
}
