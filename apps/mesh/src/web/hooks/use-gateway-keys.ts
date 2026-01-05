/**
 * Gateway Keys Hook
 *
 * Provides React hooks for managing gateway keys (API keys).
 * Uses the API_KEY_* MCP tools via createToolCaller.
 */

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { createToolCaller } from "../../tools/client";
import { useProjectContext } from "../providers/project-context-provider";

/**
 * Gateway Key entity (returned from list - no key value)
 */
export interface GatewayKeyEntity {
  id: string;
  name: string;
  userId: string;
  permissions: Record<string, string[]>;
  expiresAt: string | Date | null;
  createdAt: string | Date;
}

/**
 * Gateway Key with value (returned from create)
 */
export interface GatewayKeyWithValue extends GatewayKeyEntity {
  key: string;
}

/**
 * Input for creating a gateway key
 */
export interface GatewayKeyCreateInput {
  name: string;
  permissions?: Record<string, string[]>;
  expiresIn?: number;
  metadata?: Record<string, unknown>;
}

// Add query key for gateway keys to our key factory
const gatewayKeysKey = (orgId: string) => ["gateway-keys", orgId] as const;

/**
 * Hook to list gateway keys for the current organization
 */
export function useGatewayKeys() {
  const { org } = useProjectContext();
  const toolCaller = createToolCaller();

  const { data, refetch } = useSuspenseQuery({
    queryKey: gatewayKeysKey(org.id),
    queryFn: async () => {
      const result = await toolCaller("API_KEY_LIST", {});
      return (result as { items: GatewayKeyEntity[] }).items;
    },
    staleTime: 30_000,
  });

  return { gatewayKeys: data, refetch };
}

/**
 * Hook for gateway key actions (create, update, delete)
 */
export function useGatewayKeyActions() {
  const { org } = useProjectContext();
  const queryClient = useQueryClient();
  const toolCaller = createToolCaller();

  const create = useMutation({
    mutationFn: async (input: GatewayKeyCreateInput) => {
      const result = await toolCaller("API_KEY_CREATE", input);
      return result as GatewayKeyWithValue;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gatewayKeysKey(org.id) });
      // Don't toast here - let the caller handle it since they need to show the key
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to create gateway key: ${message}`);
    },
  });

  const update = useMutation({
    mutationFn: async ({ keyId, name }: { keyId: string; name: string }) => {
      const result = await toolCaller("API_KEY_UPDATE", { keyId, name });
      return result as { item: GatewayKeyEntity };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gatewayKeysKey(org.id) });
      toast.success("Gateway key updated");
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to update gateway key: ${message}`);
    },
  });

  const delete_ = useMutation({
    mutationFn: async (keyId: string) => {
      const result = await toolCaller("API_KEY_DELETE", { keyId });
      return result as { success: boolean; keyId: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gatewayKeysKey(org.id) });
      toast.success("Gateway key deleted");
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to delete gateway key: ${message}`);
    },
  });

  return {
    create,
    update,
    delete: delete_,
  };
}

/**
 * Helper to create permissions for a gateway
 * Uses "gw_<gatewayId>" as the resource with ["*"] access
 */
export function createGatewayPermissions(
  gatewayId: string,
): Record<string, string[]> {
  return {
    [`gw_${gatewayId}`]: ["*"],
  };
}

/**
 * Check if a gateway key has permission for a specific gateway
 */
export function hasGatewayPermission(
  permissions: Record<string, string[]>,
  gatewayId: string,
): boolean {
  const gatewayPerms = permissions[`gw_${gatewayId}`];
  return Boolean(
    gatewayPerms && (gatewayPerms.includes("*") || gatewayPerms.length > 0),
  );
}

/**
 * Extract gateway IDs from gateway key permissions
 */
export function getGatewayIdsFromPermissions(
  permissions: Record<string, string[]>,
): string[] {
  return Object.keys(permissions)
    .filter((key) => key.startsWith("gw_"))
    .map((key) => key.replace("gw_", ""));
}
