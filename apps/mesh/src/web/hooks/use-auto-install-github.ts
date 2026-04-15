/**
 * Hook to auto-install the mcp-github connection from registry and run OAuth.
 * Used by the GitHub repo picker when no GitHub connection exists.
 */

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useConnectionActions,
  useProjectContext,
  type ConnectionEntity,
} from "@decocms/mesh-sdk";
import { authenticateMcp, isConnectionAuthenticated } from "@decocms/mesh-sdk";
import { authClient } from "@/web/lib/auth-client";
import { useRegistryApp } from "@/web/hooks/use-registry-app";
import { extractConnectionData } from "@/web/utils/extract-connection-data";

type Status = "idle" | "installing" | "authenticating" | "ready" | "error";

interface UseAutoInstallGitHubResult {
  status: Status;
  error: string | null;
  connection: ConnectionEntity | null;
  retry: () => void;
}

const GITHUB_APP_ID = "deco/mcp-github";

export function useAutoInstallGitHub(opts: {
  enabled: boolean;
}): UseAutoInstallGitHubResult {
  const { org } = useProjectContext();
  const { data: session } = authClient.useSession();
  const actions = useConnectionActions();
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionEntity | null>(null);

  const { data: registryItem, isLoading: isRegistryLoading } = useRegistryApp(
    GITHUB_APP_ID,
    { enabled: opts.enabled },
  );

  // Track whether we've started the flow to avoid re-triggering
  const [started, setStarted] = useState(false);

  // Auto-trigger when registry data arrives and we haven't started yet
  if (
    opts.enabled &&
    registryItem &&
    !isRegistryLoading &&
    !started &&
    session?.user?.id &&
    status === "idle"
  ) {
    console.log(
      "[useAutoInstallGitHub] registry item loaded, starting install flow",
      {
        appId: GITHUB_APP_ID,
        registryItemId: registryItem.id,
        remoteUrl: registryItem.server?.remotes?.[0]?.url,
      },
    );
    setStarted(true);
    runInstallFlow();
  }

  async function runInstallFlow() {
    if (!registryItem || !session?.user?.id || !org) return;

    try {
      // Step 1: Create connection from registry
      setStatus("installing");
      setError(null);

      const connectionData = extractConnectionData(
        registryItem,
        org.id,
        session.user.id,
        { remoteIndex: 0 },
      );

      const remoteUrl = connectionData.connection_url;
      if (!remoteUrl) {
        throw new Error("Registry item is missing a remote URL for mcp-github");
      }

      const { id } = await actions.create.mutateAsync(connectionData);
      console.log("[useAutoInstallGitHub] connection created", {
        id,
        connectionType: connectionData.connection_type,
        url: remoteUrl,
      });

      // Step 2: Check if OAuth is needed
      setStatus("authenticating");
      const mcpProxyUrl = new URL(`/mcp/${id}`, window.location.origin);
      console.log("[useAutoInstallGitHub] checking auth status", {
        mcpProxyUrl: mcpProxyUrl.href,
      });
      const authStatus = await isConnectionAuthenticated({
        url: mcpProxyUrl.href,
        token: null,
      });
      console.log("[useAutoInstallGitHub] auth status result", authStatus);

      if (authStatus.supportsOAuth && !authStatus.isAuthenticated) {
        // Step 3: Run OAuth flow
        console.log(
          "[useAutoInstallGitHub] starting OAuth flow for connection",
          id,
        );
        const {
          token,
          tokenInfo,
          error: oauthError,
        } = await authenticateMcp({
          connectionId: id,
        });
        console.log("[useAutoInstallGitHub] OAuth result", {
          hasToken: !!token,
          hasTokenInfo: !!tokenInfo,
          error: oauthError,
        });

        if (oauthError || !token) {
          // OAuth failed or was cancelled — clean up the connection
          try {
            await actions.delete.mutateAsync(id);
          } catch {
            // Best-effort cleanup
          }
          throw new Error(oauthError ?? "No token received from GitHub");
        }

        // Step 4: Persist OAuth token
        if (tokenInfo) {
          try {
            console.log(
              "[useAutoInstallGitHub] persisting OAuth token via /api/connections endpoint",
            );
            const response = await fetch(`/api/connections/${id}/oauth-token`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                accessToken: tokenInfo.accessToken,
                refreshToken: tokenInfo.refreshToken,
                expiresIn: tokenInfo.expiresIn,
                scope: tokenInfo.scope,
                clientId: tokenInfo.clientId,
                clientSecret: tokenInfo.clientSecret,
                tokenEndpoint: tokenInfo.tokenEndpoint,
              }),
            });
            console.log("[useAutoInstallGitHub] token persist response", {
              ok: response.ok,
              status: response.status,
            });
            if (!response.ok) {
              console.log(
                "[useAutoInstallGitHub] falling back to connection_token field",
              );
              await actions.update.mutateAsync({
                id,
                data: { connection_token: token },
              });
            }
          } catch (persistErr) {
            console.log(
              "[useAutoInstallGitHub] token persist error, using fallback",
              persistErr,
            );
            await actions.update.mutateAsync({
              id,
              data: { connection_token: token },
            });
          }
        }
      } else {
        console.log(
          "[useAutoInstallGitHub] no OAuth needed or already authenticated",
        );
      }

      // Step 5: Invalidate connection queries so picker re-renders
      console.log("[useAutoInstallGitHub] invalidating connection queries");
      await queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return key[1] === org.id && key[3] === "collection";
        },
      });

      setConnection(connectionData as ConnectionEntity);
      setStatus("ready");
      console.log("[useAutoInstallGitHub] flow complete, status=ready", {
        connectionId: connectionData.id,
      });
    } catch (err) {
      console.error("[useAutoInstallGitHub] flow error", err);
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  function retry() {
    setStatus("idle");
    setError(null);
    setConnection(null);
    setStarted(false);
  }

  // While registry is loading, show installing status
  if (opts.enabled && isRegistryLoading && status === "idle") {
    return { status: "installing", error: null, connection: null, retry };
  }

  return { status, error, connection, retry };
}
