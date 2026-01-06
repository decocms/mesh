/**
 * Hook for toolbox-aware navigation
 *
 * Provides navigation helpers that automatically use toolbox-scoped routes
 * when inside a toolbox context, otherwise fall back to org-level routes.
 */

import { useNavigate } from "@tanstack/react-router";
import { useOptionalToolboxContext } from "@/web/providers/toolbox-context-provider";
import { useProjectContext } from "@/web/providers/project-context-provider";

export function useToolboxNavigation() {
  const navigate = useNavigate();
  const toolboxContext = useOptionalToolboxContext();
  const { org } = useProjectContext();

  const isInToolbox = !!toolboxContext;

  const navigateToCollectionDetail = (params: {
    connectionId: string;
    collectionName: string;
    itemId: string;
    replayId?: string;
  }) => {
    if (isInToolbox) {
      navigate({
        to: "/$org/toolbox/$toolboxId/mcps/$connectionId/$collectionName/$itemId",
        params: {
          org: org.slug,
          toolboxId: toolboxContext.toolboxId,
          connectionId: params.connectionId,
          collectionName: params.collectionName,
          itemId: params.itemId,
        },
        search: params.replayId ? { replayId: params.replayId } : undefined,
      });
    } else {
      navigate({
        to: "/$org/mcps/$connectionId/$collectionName/$itemId",
        params: {
          org: org.slug,
          connectionId: params.connectionId,
          collectionName: params.collectionName,
          itemId: params.itemId,
        },
        search: params.replayId ? { replayId: params.replayId } : undefined,
      });
    }
  };

  const navigateToStoreDetail = (params: {
    appName: string;
    registryId?: string;
    serverName?: string;
    itemId?: string;
  }) => {
    if (isInToolbox) {
      navigate({
        to: "/$org/toolbox/$toolboxId/store/$appName",
        params: {
          org: org.slug,
          toolboxId: toolboxContext.toolboxId,
          appName: params.appName,
        },
        search: {
          registryId: params.registryId,
          serverName: params.serverName,
          itemId: params.itemId,
        },
      });
    } else {
      navigate({
        to: "/$org/store/$appName",
        params: {
          org: org.slug,
          appName: params.appName,
        },
        search: {
          registryId: params.registryId,
          serverName: params.serverName,
          itemId: params.itemId,
        },
      });
    }
  };

  const navigateToConnection = (params: { connectionId: string }) => {
    if (isInToolbox) {
      // For now, connection detail pages stay at org level
      // Could add toolbox-scoped connection detail route later if needed
      navigate({
        to: "/$org/mcps/$connectionId",
        params: {
          org: org.slug,
          connectionId: params.connectionId,
        },
      });
    } else {
      navigate({
        to: "/$org/mcps/$connectionId",
        params: {
          org: org.slug,
          connectionId: params.connectionId,
        },
      });
    }
  };

  return {
    navigateToCollectionDetail,
    navigateToStoreDetail,
    navigateToConnection,
    isInToolbox,
  };
}

