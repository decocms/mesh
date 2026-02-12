import { useState } from "react";
import { authenticateMcp, isConnectionAuthenticated } from "@decocms/mesh-sdk";
import { Badge } from "@deco/ui/components/badge.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { Card } from "@deco/ui/components/card.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { toast } from "sonner";
import {
  useSyncTestConnections,
  useTestConnections,
  useUpdateTestConnectionAuth,
} from "../hooks/use-test-runs";
import type {
  TestConnectionAuthStatus,
  TestConnectionListItem,
} from "../lib/types";

function authBadgeStyle(status: TestConnectionAuthStatus) {
  switch (status) {
    case "authenticated":
      return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
    case "needs_auth":
      return "bg-amber-500/10 text-amber-600 border-amber-500/20";
    default:
      return "bg-zinc-500/10 text-zinc-500 border-zinc-500/20";
  }
}

function authBadgeLabel(status: TestConnectionAuthStatus) {
  switch (status) {
    case "authenticated":
      return "Authenticated";
    case "needs_auth":
      return "Needs Auth";
    default:
      return "Not checked";
  }
}

function ConnectionRow({
  entry,
  onAuthChanged,
}: {
  entry: TestConnectionListItem;
  onAuthChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [tokenValue, setTokenValue] = useState("");
  const [probeResult, setProbeResult] = useState<{
    checked: boolean;
    supportsOAuth: boolean;
    isAuthenticated: boolean;
    isServerError: boolean;
  }>({
    checked: false,
    supportsOAuth: false,
    isAuthenticated: false,
    isServerError: false,
  });

  const updateAuth = useUpdateTestConnectionAuth();
  const connectionId = entry.mapping.connection_id;
  const authStatus = entry.mapping.auth_status;
  const title = entry.item?.title ?? entry.mapping.item_id;
  const isAuthenticated = authStatus === "authenticated";

  /** Probe the connection via Mesh proxy to determine its auth state */
  const probe = async () => {
    try {
      const probeUrl = `/mcp/${connectionId}`;
      const status = await isConnectionAuthenticated({
        url: probeUrl,
        token: null,
      });
      setProbeResult({
        checked: true,
        supportsOAuth: status.supportsOAuth ?? false,
        isAuthenticated: status.isAuthenticated ?? false,
        isServerError: status.isServerError ?? false,
      });

      // Auto-update auth_status if probe shows authenticated but DB says otherwise
      if (status.isAuthenticated && authStatus !== "authenticated") {
        updateAuth.mutate(
          { connectionId, authStatus: "authenticated" },
          { onSuccess: () => onAuthChanged() },
        );
      }

      return status;
    } catch {
      setProbeResult({
        checked: true,
        supportsOAuth: false,
        isAuthenticated: false,
        isServerError: true,
      });
      return null;
    }
  };

  const markAuthenticated = () => {
    updateAuth.mutate(
      { connectionId, authStatus: "authenticated" },
      { onSuccess: () => onAuthChanged() },
    );
  };

  const handleAuthenticate = async () => {
    setBusy(true);
    try {
      // Always probe first
      const status = await probe();
      if (!status) {
        toast.error(`Could not reach "${title}". The remote MCP may be down.`);
        return;
      }

      if (status.isAuthenticated) {
        toast.success(`"${title}" is already authenticated.`);
        markAuthenticated();
        return;
      }

      if (status.isServerError) {
        toast.error(`Server error for "${title}". The remote MCP may be down.`);
        return;
      }

      if (!status.supportsOAuth) {
        toast.warning(
          `"${title}" does not support OAuth. Use the Token field to paste an API key.`,
        );
        setShowTokenInput(true);
        return;
      }

      // Server supports OAuth — trigger the flow
      toast.info(`Opening authentication window for "${title}"...`);
      const authResult = await authenticateMcp({
        connectionId,
        clientName: `MCP Test - ${title}`,
        timeout: 180000,
      });

      if (authResult.error) {
        toast.error(`OAuth failed for "${title}": ${authResult.error}`);
        return;
      }

      // Save OAuth tokens
      if (authResult.tokenInfo) {
        const res = await fetch(
          `/api/connections/${connectionId}/oauth-token`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              accessToken: authResult.tokenInfo.accessToken,
              refreshToken: authResult.tokenInfo.refreshToken,
              expiresIn: authResult.tokenInfo.expiresIn,
              scope: authResult.tokenInfo.scope,
              clientId: authResult.tokenInfo.clientId,
              clientSecret: authResult.tokenInfo.clientSecret,
              tokenEndpoint: authResult.tokenInfo.tokenEndpoint,
            }),
          },
        );
        if (!res.ok) {
          // Fallback: save as plain token
          if (authResult.token) {
            await saveTokenInternal(authResult.token);
          }
        }
      } else if (authResult.token) {
        await saveTokenInternal(authResult.token);
      }

      toast.success(`"${title}" authenticated!`);
      markAuthenticated();
    } catch (err) {
      console.error("[TestConnectionsPanel] Auth error:", err);
      toast.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const saveTokenInternal = async (token: string) => {
    const res = await fetch("/mcp/self", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "COLLECTION_CONNECTIONS_UPDATE",
          arguments: {
            id: connectionId,
            data: { connection_token: token },
          },
        },
      }),
    });
    if (!res.ok) {
      throw new Error("Failed to save token");
    }
  };

  const handleSaveToken = async () => {
    if (!tokenValue.trim()) {
      toast.error("Token cannot be empty.");
      return;
    }
    setBusy(true);
    try {
      await saveTokenInternal(tokenValue);
      toast.success(`Token saved for "${title}"!`);
      setShowTokenInput(false);
      setTokenValue("");
      markAuthenticated();
    } catch (err) {
      toast.error(
        `Error saving token: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setBusy(false);
    }
  };

  // Show probe button or result-based buttons
  const showOAuthButton = !probeResult.checked || probeResult.supportsOAuth;

  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{title}</p>
          <p className="text-xs text-muted-foreground break-all">
            {entry.remoteUrl ?? "-"}
          </p>
          <Badge
            variant="outline"
            className={`mt-1 text-[10px] ${authBadgeStyle(authStatus)}`}
          >
            {authBadgeLabel(authStatus)}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {!isAuthenticated && (
            <>
              {!probeResult.checked ? (
                <Button size="sm" onClick={handleAuthenticate} disabled={busy}>
                  {busy ? "Checking..." : "Authenticate"}
                </Button>
              ) : (
                <>
                  {showOAuthButton && (
                    <Button
                      size="sm"
                      onClick={handleAuthenticate}
                      disabled={busy}
                    >
                      {busy ? "..." : "OAuth"}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowTokenInput(!showTokenInput)}
                    disabled={busy}
                  >
                    Token
                  </Button>
                </>
              )}
            </>
          )}
          {isAuthenticated && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleAuthenticate}
              disabled={busy}
            >
              {busy ? "..." : "Re-check"}
            </Button>
          )}
        </div>
      </div>

      {/* Inline token input */}
      {showTokenInput && (
        <div className="flex items-center gap-2">
          <Input
            type="password"
            placeholder="Paste API token / key..."
            value={tokenValue}
            onChange={(e) => setTokenValue(e.target.value)}
            className="h-8 text-xs flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSaveToken();
              }
            }}
          />
          <Button
            size="sm"
            className="h-8 text-xs"
            onClick={handleSaveToken}
            disabled={busy || !tokenValue.trim()}
          >
            Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs"
            onClick={() => {
              setShowTokenInput(false);
              setTokenValue("");
            }}
          >
            ✕
          </Button>
        </div>
      )}
    </div>
  );
}

export function TestConnectionsPanel() {
  const listQuery = useTestConnections();
  const syncMutation = useSyncTestConnections();
  const items = listQuery.data?.items ?? [];

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Test Connections</h3>
          <p className="text-[10px] text-muted-foreground">
            Click <strong>Authenticate</strong> to auto-detect OAuth or paste a
            Token manually.
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            Listing tools alone does not imply authenticated status.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            syncMutation.mutate(undefined, {
              onSuccess: () => toast.success("Connections synced"),
              onError: (err) => toast.error(`Sync failed: ${err.message}`),
            });
          }}
          disabled={syncMutation.isPending}
        >
          {syncMutation.isPending ? "Syncing..." : "Sync"}
        </Button>
      </div>
      <div className="space-y-2 max-h-[52vh] overflow-auto pr-1">
        {items.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-3">
            No test connections yet. Click &quot;Sync&quot; to create them from
            your registry items.
          </p>
        )}
        {items.map((entry) => (
          <ConnectionRow
            key={entry.mapping.id}
            entry={entry}
            onAuthChanged={() => listQuery.refetch()}
          />
        ))}
      </div>
    </Card>
  );
}
