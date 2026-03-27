/**
 * Hook to install an MCP Server from registry by binding type.
 * Provides inline installation without navigation.
 *
 * Uses the unified REGISTRY_SEARCH tool via the self MCP instead of
 * querying each registry connection directly.
 */

import { toast } from "sonner";
import type { RegistryItem } from "@/web/components/store/types";
import { authClient } from "@/web/lib/auth-client";
import {
  SELF_MCP_ALIAS_ID,
  useConnectionActions,
  useMCPClient,
  useProjectContext,
  type ConnectionEntity,
} from "@decocms/mesh-sdk";
import { extractConnectionData } from "@/web/utils/extract-connection-data";

interface InstallResult {
  id: string;
  connection: ConnectionEntity;
}

interface UseInstallFromRegistryResult {
  /**
   * Install an MCP Server by binding type (e.g., "@deco/database").
   * Returns the new connection data if successful, undefined otherwise.
   */
  installByBinding: (bindingType: string) => Promise<InstallResult | undefined>;
  /**
   * Whether an installation is in progress
   */
  isInstalling: boolean;
}

/**
 * Normalize MCP Server name format, ensuring @ prefix is present
 */
function parseServerName(serverName: string): string {
  return serverName.startsWith("@") ? serverName : `@${serverName}`;
}

/**
 * Hook that provides inline MCP Server installation from registry.
 * Use this when you want to install a specific MCP Server without navigating away.
 */
export function useInstallFromRegistry(): UseInstallFromRegistryResult {
  const { org } = useProjectContext();
  const { data: session } = authClient.useSession();
  const actions = useConnectionActions();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  const installByBinding = async (
    bindingType: string,
  ): Promise<InstallResult | undefined> => {
    if (!org || !session?.user?.id) {
      toast.error("Not authenticated");
      return undefined;
    }

    const parsedServerName = parseServerName(bindingType);

    // Search all enabled registries via unified tool
    const result = (await client.callTool({
      name: "REGISTRY_SEARCH",
      arguments: {
        query: parsedServerName,
        limit: 5,
      },
    })) as { structuredContent?: unknown };

    const payload = (result.structuredContent ?? result) as {
      items?: Array<Record<string, unknown>>;
    };
    const items = payload?.items ?? [];

    // Find exact match by server name
    const registryItem = items.find((item) => {
      const server = item.server as { name?: string } | undefined;
      return (
        server?.name === parsedServerName || item.name === parsedServerName
      );
    }) as RegistryItem | undefined;

    if (!registryItem) {
      toast.error(`MCP Server not found in registry: ${bindingType}`);
      return undefined;
    }

    // Extract connection data
    const connectionData = extractConnectionData(
      registryItem,
      org.id,
      session.user.id,
    );

    // Validate connection data based on type
    const isStdioConnection = connectionData.connection_type === "STDIO";
    const hasUrl = Boolean(connectionData.connection_url);
    const hasStdioConfig =
      isStdioConnection &&
      connectionData.connection_headers &&
      typeof connectionData.connection_headers === "object" &&
      "command" in connectionData.connection_headers;

    if (!hasUrl && !hasStdioConfig) {
      toast.error(
        "This MCP Server cannot be connected: no connection method available",
      );
      return undefined;
    }

    await actions.create.mutateAsync(connectionData);
    return {
      id: connectionData.id,
      connection: connectionData as ConnectionEntity,
    };
  };

  return {
    installByBinding,
    isInstalling: actions.create.isPending,
  };
}
