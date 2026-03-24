/**
 * Connection Hooks
 *
 * Provides React hooks for working with connections using React Query.
 */

import type { ConnectionEntity } from "../types/connection";
import { useProjectContext } from "../context/project-context";
import { useCollectionActions, useCollectionItem } from "./use-collections";
import { useMCPClient } from "./use-mcp-client";
import { SELF_MCP_ALIAS_ID } from "../lib/constants";
import { useSuspenseQuery } from "@tanstack/react-query";
import { KEYS } from "../lib/query-keys";

/**
 * Options for useConnections hook
 */
export interface UseConnectionsOptions {
  /**
   * Server-side binding filter. Only returns connections whose tools satisfy the binding.
   * Can be a well-known binding name (e.g., "LLM", "ASSISTANTS", "OBJECT_STORAGE")
   * or a custom binding schema object.
   */
  binding?: string | Record<string, unknown>;
  /**
   * Whether to include VIRTUAL connections in results. Defaults to false (server default).
   */
  includeVirtual?: boolean;
}

interface ConnectionListOutput {
  items: ConnectionEntity[];
  totalCount: number;
  hasMore: boolean;
}

function extractPayload(result: unknown): ConnectionListOutput {
  if (!result || typeof result !== "object") {
    throw new Error("Invalid result");
  }

  if ("isError" in result && result.isError) {
    throw new Error(
      "content" in result &&
        Array.isArray(result.content) &&
        result.content[0]?.type === "text"
        ? result.content[0].text
        : "Unknown error",
    );
  }

  if ("structuredContent" in result) {
    return result.structuredContent as ConnectionListOutput;
  }

  throw new Error("No structured content found");
}

/**
 * Hook to get all connections.
 *
 * Returns the full list; callers handle client-side filtering/sorting.
 */
export function useConnections(options: UseConnectionsOptions = {}) {
  const { binding, includeVirtual } = options;

  const toolArgs: Record<string, unknown> = {};
  if (binding !== undefined) {
    toolArgs.binding = binding;
  }
  if (includeVirtual !== undefined) {
    toolArgs.include_virtual = includeVirtual;
  }

  const argsKey = JSON.stringify(toolArgs);
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  const { data } = useSuspenseQuery({
    queryKey: KEYS.collectionList(client, org.id, "", "CONNECTIONS", argsKey),
    queryFn: async () => {
      const result = await client.callTool({
        name: "COLLECTION_CONNECTIONS_LIST",
        arguments: toolArgs,
      });
      return extractPayload(result);
    },
    staleTime: 30_000,
    retry: false,
  });

  return data?.items ?? [];
}

/**
 * Hook to get a single connection by ID
 */
export function useConnection(connectionId: string | undefined) {
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });
  return useCollectionItem<ConnectionEntity>(
    org.id,
    "CONNECTIONS",
    connectionId,
    client,
  );
}

/**
 * Hook to get connection mutation actions (create, update, delete)
 */
export function useConnectionActions() {
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });
  return useCollectionActions<ConnectionEntity>(org.id, "CONNECTIONS", client);
}
