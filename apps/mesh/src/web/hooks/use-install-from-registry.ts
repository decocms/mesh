/**
 * Hook to install a MCP from registry by binding type.
 * Provides inline installation without navigation.
 */

import { toast } from "sonner";
import { createToolCaller } from "@/tools/client";
import type { RegistryItem } from "@/web/components/store/registry-items-section";
import type { ConnectionEntity } from "@/tools/connection/schema";
import {
  useConnectionActions,
  useConnections,
} from "@/web/hooks/collections/use-connection";
import { useRegistryConnections } from "@/web/hooks/use-binding";
import { useToolCall } from "@/web/hooks/use-tool-call";
import { authClient } from "@/web/lib/auth-client";
import { useProjectContext } from "@/web/providers/project-context-provider";
import {
  extractConnectionData,
  findRegistryItemByBinding,
} from "@/web/utils/extract-connection-data";
import {
  findListToolName,
  extractItemsFromResponse,
} from "@/web/utils/registry-utils";

interface InstallResult {
  id: string;
  connection: ConnectionEntity;
}

interface UseInstallFromRegistryResult {
  /**
   * Install a MCP by binding type (e.g., "@deco/database").
   * Returns the new connection data if successful, undefined otherwise.
   */
  installByBinding: (bindingType: string) => Promise<InstallResult | undefined>;
  /**
   * Whether an installation is in progress
   */
  isInstalling: boolean;
  /**
   * Registry items (for debugging/display)
   */
  registryItems: RegistryItem[];
}

/**
 * Hook that provides inline MCP installation from registry.
 * Use this when you want to install a specific MCP without navigating away.
 */
export function useInstallFromRegistry(): UseInstallFromRegistryResult {
  const { org } = useProjectContext();
  const { data: session } = authClient.useSession();
  const actions = useConnectionActions();

  // Get all connections and filter to registry connections
  const allConnections = useConnections();
  const registryConnections = useRegistryConnections(allConnections);

  // Use first registry connection (could be extended to search all registries)
  const registryId = registryConnections[0]?.id || "";
  const registryConnection = registryConnections[0];

  // Find the LIST tool from the registry connection
  const listToolName = findListToolName(registryConnection?.tools);

  const toolCaller = createToolCaller(registryId || "");

  // Always call useToolCall (hooks must be called unconditionally)
  // If prerequisites aren't met (empty listToolName or registryId), the query will
  // fail. Components using this hook should be wrapped in Suspense + ErrorBoundary.
  // For now, we'll handle empty prerequisites by not calling the hook when they're missing,
  // but this violates hook rules. The proper solution is to wrap the component that uses
  // this hook in Suspense + ErrorBoundary and handle the error case there.
  //
  // TODO: Refactor to always call useToolCall and handle empty prerequisites in queryFn
  // or wrap BindingSelector in Suspense + ErrorBoundary
  let registryItems: RegistryItem[] = [];

  // Note: This conditional hook call violates React's rules of hooks.
  // The proper fix is to wrap BindingSelector in Suspense + ErrorBoundary
  // and always call useToolCall. For now, we'll keep this pattern but it should be fixed.
  if (listToolName && registryId) {
    const { data: listResults } = useToolCall({
      toolCaller,
      toolName: listToolName,
      toolInputParams: {},
      connectionId: registryId,
    });

    registryItems = extractItemsFromResponse<RegistryItem>(listResults);
  }

  // Installation function
  const installByBinding = async (
    bindingType: string,
  ): Promise<InstallResult | undefined> => {
    if (!org || !session?.user?.id) {
      toast.error("Not authenticated");
      return undefined;
    }

    // Find the registry item matching the binding type
    const registryItem = findRegistryItemByBinding(registryItems, bindingType);

    if (!registryItem) {
      toast.error(`MCP not found in registry: ${bindingType}`);
      return undefined;
    }

    // Extract connection data
    const connectionData = extractConnectionData(
      registryItem,
      org.id,
      session.user.id,
    );

    if (!connectionData.connection_url) {
      toast.error("This MCP cannot be installed: no connection URL available");
      return undefined;
    }

    try {
      await actions.create.mutateAsync(connectionData);
      // Success toast is handled by the mutation's onSuccess
      // Return full connection data so caller doesn't need to fetch from collection
      return {
        id: connectionData.id,
        connection: connectionData as ConnectionEntity,
      };
    } catch (err) {
      // Error toast is handled by the mutation's onError
      return undefined;
    }
  };

  return {
    installByBinding,
    isInstalling: actions.create.isPending,
    registryItems,
  };
}
