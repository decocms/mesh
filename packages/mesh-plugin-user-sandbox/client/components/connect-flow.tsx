/**
 * User Sandbox Plugin - Connect Flow UI Component
 *
 * Brandless UI for the end-user connect flow.
 * This component handles the OAuth flow and session management.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@deco/ui/components/button.tsx";
import { Card, CardContent } from "@deco/ui/components/card.tsx";
import {
  Loader2,
  Check,
  ExternalLink,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Toaster } from "@deco/ui/components/sonner.tsx";
import {
  authenticateMcp,
  isConnectionAuthenticated,
  openOAuthPopup,
} from "@decocms/mesh-sdk";
import { KEYS } from "../lib/query-keys";

// ============================================================================
// Types
// ============================================================================

interface AppStatus {
  configured: boolean;
  connection_id: string | null;
  error: string | null;
}

interface RequiredApp {
  app_name: string;
  title: string;
  description: string | null;
  icon: string | null;
  connection_type: string;
  requires_oauth: boolean;
  selected_tools: string[] | null;
  selected_resources: string[] | null;
  selected_prompts: string[] | null;
  status: AppStatus;
}

interface SessionData {
  session: {
    id: string;
    status: string;
    external_user_id: string;
    expires_at: string;
    redirect_url: string | null;
    created_agent_id: string | null;
  };
  template: {
    id: string;
    title: string;
    description: string | null;
    icon: string | null;
  };
  apps: RequiredApp[];
}

interface ProvisionResponse {
  success: boolean;
  connection_id: string;
  already_provisioned: boolean;
  requires_oauth: boolean;
}

// ============================================================================
// Props
// ============================================================================

export interface ConnectFlowProps {
  /** The session ID from the URL */
  sessionId: string;
  /** Called when setup completes successfully (if no redirect) */
  onComplete?: (result: { agentId?: string; redirectUrl?: string }) => void;
  /** Called when an error occurs */
  onError?: (error: Error) => void;
}

// ============================================================================
// Component
// ============================================================================

export function ConnectFlow({
  sessionId,
  onComplete,
  onError,
}: ConnectFlowProps) {
  const queryClient = useQueryClient();
  const [configuringApp, setConfiguringApp] = useState<string | null>(null);

  // Fetch session data
  const {
    data: sessionData,
    isLoading,
    error,
  } = useQuery<SessionData>({
    queryKey: KEYS.session(sessionId),
    queryFn: async () => {
      const res = await fetch(`/api/user-sandbox/sessions/${sessionId}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to load session");
      }
      return res.json();
    },
  });

  // Configure app mutation (marks as configured after OAuth)
  const configureMutation = useMutation({
    mutationFn: async ({
      appName,
      connectionId,
    }: {
      appName: string;
      connectionId?: string;
    }) => {
      const res = await fetch(
        `/api/user-sandbox/sessions/${sessionId}/configure`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            app_name: appName,
            connection_id: connectionId,
          }),
        },
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Configuration failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: KEYS.session(sessionId),
      });
    },
  });

  // Complete session mutation
  const completeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/user-sandbox/sessions/${sessionId}/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        },
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to complete");
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else {
        toast.success("Setup complete!");
        queryClient.invalidateQueries({
          queryKey: KEYS.session(sessionId),
        });
        onComplete?.({
          agentId: data.agentId,
          redirectUrl: data.redirectUrl,
        });
      }
    },
    onError: (err) => {
      const error =
        err instanceof Error ? err : new Error("Failed to complete");
      toast.error(error.message);
      onError?.(error);
    },
  });

  /**
   * Handle connecting an app:
   * 1. Provision the connection (create it in the org)
   * 2. If OAuth required, authenticate with the MCP server
   * 3. Mark as configured
   */
  const handleConnect = async (app: RequiredApp) => {
    setConfiguringApp(app.app_name);

    // Pre-open popup window synchronously in click handler to avoid popup blocker (Safari/iOS)
    // We'll close it if OAuth isn't needed, or use it if it is
    const isRemoteConnection =
      app.connection_type === "HTTP" ||
      app.connection_type === "SSE" ||
      app.connection_type === "Websocket";

    let popupWindow: Window | null = null;
    if (isRemoteConnection) {
      popupWindow = openOAuthPopup();
      // Note: we don't throw if popup is blocked here - OAuth might not be needed
    }

    try {
      // Step 1: Provision the connection
      const provisionRes = await fetch(
        `/api/user-sandbox/sessions/${sessionId}/provision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ app_name: app.app_name }),
        },
      );

      if (!provisionRes.ok) {
        const data = await provisionRes.json();
        throw new Error(data.error || "Failed to provision connection");
      }

      const provision: ProvisionResponse = await provisionRes.json();
      const connectionId = provision.connection_id;

      // Step 2: Check if connection needs authentication
      // For HTTP/SSE connections, probe the connection to see if it requires auth
      // OAuth discovery happens automatically - we don't need pre-configured oauth_config

      if (isRemoteConnection) {
        // Probe the connection to check if it requires authentication
        const probeUrl = `/mcp/${connectionId}`;
        const authStatus = await isConnectionAuthenticated({
          url: probeUrl,
          token: null,
        });

        // If not authenticated and supports OAuth, trigger OAuth flow
        if (!authStatus.isAuthenticated && authStatus.supportsOAuth) {
          // Check if popup was blocked
          if (!popupWindow) {
            throw new Error(
              "Popup was blocked. Please allow popups for this site and try again.",
            );
          }

          toast.info("Opening authentication window...");

          const authResult = await authenticateMcp({
            connectionId,
            clientName: app.title,
            timeout: 300000, // 5 minute timeout for OAuth
            popupWindow,
          });

          if (authResult.error) {
            throw new Error(authResult.error);
          }

          // Save OAuth tokens to the connection
          if (authResult.tokenInfo) {
            const tokenRes = await fetch(
              `/api/connections/${connectionId}/oauth-token`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
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

            if (!tokenRes.ok) {
              const errorData = await tokenRes.json().catch(() => ({}));
              throw new Error(
                errorData.error ||
                  "Failed to save authentication tokens. Please try again.",
              );
            }
          }
        } else {
          // OAuth not needed, close the pre-opened popup
          popupWindow?.close();
        }
        // If not authenticated but doesn't support OAuth, proceed anyway
        // The user may need to configure manually
      }

      // Step 3: Mark as configured
      await configureMutation.mutateAsync({
        appName: app.app_name,
        connectionId,
      });

      toast.success(`${app.title} connected successfully`);
    } catch (err) {
      // Close popup on error
      popupWindow?.close();
      console.error("Connection error:", err);
      const error = err instanceof Error ? err : new Error("Failed to connect");
      toast.error(error.message);
      onError?.(error);
    } finally {
      setConfiguringApp(null);
    }
  };

  const allConfigured = sessionData?.apps.every((app) => app.status.configured);
  const isCompleted = sessionData?.session.status === "completed";

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="size-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertCircle className="size-6 text-destructive" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Session Error</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {error instanceof Error ? error.message : "Failed to load"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!sessionData) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Toaster />
      <div className="max-w-lg mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-8">
          {sessionData.template.icon && (
            <div className="size-16 mx-auto mb-4 rounded-xl bg-muted flex items-center justify-center overflow-hidden">
              <img
                src={sessionData.template.icon}
                alt=""
                className="size-10 object-contain"
              />
            </div>
          )}
          <h1 className="text-2xl font-semibold tracking-tight">
            {sessionData.template.title}
          </h1>
          {sessionData.template.description && (
            <p className="text-muted-foreground mt-2">
              {sessionData.template.description}
            </p>
          )}
        </div>

        {/* Completed state */}
        {isCompleted && (
          <Card className="mb-6 border-green-500/20 bg-green-500/5">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-full bg-green-500/10 flex items-center justify-center">
                  <Check className="size-5 text-green-500" />
                </div>
                <div>
                  <p className="font-medium">Setup Complete</p>
                  <p className="text-sm text-muted-foreground">
                    Your integrations are ready to use.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Apps list */}
        <div className="space-y-3">
          {sessionData.apps.map((app) => (
            <Card key={app.app_name}>
              <CardContent className="py-4">
                <div className="flex items-center gap-4">
                  <div className="size-10 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                    {app.icon ? (
                      <img
                        src={app.icon}
                        alt=""
                        className="size-6 object-contain"
                      />
                    ) : (
                      <span className="text-lg">📦</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{app.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {app.status.configured ? (
                        <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                          <Check className="size-3" /> Connected
                        </span>
                      ) : app.requires_oauth ? (
                        "Requires authentication"
                      ) : (
                        "Ready to connect"
                      )}
                    </p>
                  </div>
                  {!app.status.configured && !isCompleted && (
                    <Button
                      size="sm"
                      onClick={() => handleConnect(app)}
                      disabled={
                        configuringApp !== null || completeMutation.isPending
                      }
                    >
                      {configuringApp === app.app_name ? (
                        <>
                          <Loader2 className="size-4 mr-2 animate-spin" />
                          Connecting...
                        </>
                      ) : (
                        <>
                          <ExternalLink className="size-4 mr-2" />
                          Connect
                        </>
                      )}
                    </Button>
                  )}
                  {app.status.configured && !isCompleted && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleConnect(app)}
                      disabled={
                        configuringApp !== null || completeMutation.isPending
                      }
                    >
                      <RefreshCw className="size-4 mr-2" />
                      Reconnect
                    </Button>
                  )}
                  {isCompleted && (
                    <div className="size-8 rounded-full bg-green-500/10 flex items-center justify-center">
                      <Check className="size-4 text-green-500" />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Complete button */}
        {allConfigured && !isCompleted && (
          <div className="mt-6">
            <Button
              className="w-full"
              size="lg"
              onClick={() => completeMutation.mutate()}
              disabled={completeMutation.isPending}
            >
              {completeMutation.isPending ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" />
                  Completing...
                </>
              ) : (
                "Complete Setup"
              )}
            </Button>
          </div>
        )}

        {/* Session info */}
        <div className="mt-8 pt-6 border-t text-center">
          <p className="text-xs text-muted-foreground">
            Session expires:{" "}
            {new Date(sessionData.session.expires_at).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}
