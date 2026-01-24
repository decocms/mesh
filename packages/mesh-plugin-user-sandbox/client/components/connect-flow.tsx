/**
 * User Sandbox Plugin - Connect Flow UI Components
 *
 * Brandless UI for the end-user connect flow.
 * This component can be embedded in a SPA or used standalone.
 */

import * as React from "react";

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
  selected_tools: string[] | null;
  selected_resources: string[] | null;
  selected_prompts: string[] | null;
  status: AppStatus;
}

interface SessionStatus {
  session: {
    id: string;
    status: "pending" | "in_progress" | "completed";
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

interface ConnectFlowProps {
  sessionId: string;
  onComplete?: (result: { agentId?: string; redirectUrl?: string }) => void;
  onError?: (error: Error) => void;
}

// ============================================================================
// API Helpers
// ============================================================================

async function fetchSessionStatus(sessionId: string): Promise<SessionStatus> {
  const res = await fetch(`/connect/${sessionId}/status`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to load session: ${res.status}`);
  }
  return res.json();
}

async function configureApp(
  sessionId: string,
  appName: string,
  config?: { connectionId?: string },
): Promise<void> {
  const res = await fetch(`/connect/${sessionId}/configure`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app_name: appName,
      connection_id: config?.connectionId,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to configure app");
  }
}

async function completeSetup(
  sessionId: string,
): Promise<{ success: boolean; redirectUrl?: string; agentId?: string }> {
  const res = await fetch(`/connect/${sessionId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to complete setup");
  }

  return res.json();
}

// ============================================================================
// Components
// ============================================================================

/**
 * App Card Component
 */
function AppCard({
  app,
  onConnect,
  loading,
}: {
  app: RequiredApp;
  onConnect: () => void;
  loading: boolean;
}) {
  const configured = app.status?.configured;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "16px",
        padding: "16px",
        background: "rgba(255, 255, 255, 0.03)",
        borderRadius: "12px",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        transition: "background 0.2s",
      }}
    >
      <div
        style={{
          width: "40px",
          height: "40px",
          borderRadius: "10px",
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "20px",
        }}
      >
        📦
      </div>

      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 500, color: "#fff" }}>{app.app_name}</div>
        <div
          style={{
            fontSize: "13px",
            color: configured ? "#4ade80" : "#888",
            marginTop: "2px",
          }}
        >
          {configured ? "✓ Connected" : "Not connected"}
        </div>
      </div>

      {configured ? (
        <span
          style={{
            fontSize: "12px",
            padding: "4px 12px",
            borderRadius: "12px",
            background: "#4ade80",
            color: "#0a2010",
            fontWeight: 500,
          }}
        >
          Connected
        </span>
      ) : (
        <button
          onClick={onConnect}
          disabled={loading}
          style={{
            padding: "10px 20px",
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            border: "none",
            borderRadius: "8px",
            color: "white",
            fontWeight: 500,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.5 : 1,
            transition: "transform 0.2s, box-shadow 0.2s",
          }}
        >
          {loading ? "Connecting..." : "Connect"}
        </button>
      )}
    </div>
  );
}

/**
 * Main Connect Flow Component
 */
export function ConnectFlow({
  sessionId,
  onComplete,
  onError,
}: ConnectFlowProps) {
  const [status, setStatus] = React.useState<SessionStatus | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [configuring, setConfiguring] = React.useState<string | null>(null);
  const [completing, setCompleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Load initial status
  React.useEffect(() => {
    fetchSessionStatus(sessionId)
      .then((data) => {
        setStatus(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
        onError?.(err);
      });
  }, [sessionId, onError]);

  // Handle app connection
  const handleConnect = async (appName: string) => {
    setConfiguring(appName);
    setError(null);

    try {
      // In production, this would trigger OAuth flow or show config modal
      // For now, we just mark it as configured
      await configureApp(sessionId, appName);

      // Refresh status
      const newStatus = await fetchSessionStatus(sessionId);
      setStatus(newStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Configuration failed");
      onError?.(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setConfiguring(null);
    }
  };

  // Handle completion
  const handleComplete = async () => {
    setCompleting(true);
    setError(null);

    try {
      const result = await completeSetup(sessionId);

      if (result.redirectUrl) {
        window.location.href = result.redirectUrl;
      } else {
        onComplete?.({
          agentId: result.agentId,
          redirectUrl: result.redirectUrl,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Completion failed");
      onError?.(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setCompleting(false);
    }
  };

  // Check if all apps are configured
  const allConfigured =
    status?.apps.every((app) => app.status?.configured) ?? false;

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "200px",
          color: "#888",
        }}
      >
        Loading...
      </div>
    );
  }

  if (!status) {
    return (
      <div
        style={{
          padding: "20px",
          textAlign: "center",
          color: "#f87171",
        }}
      >
        {error || "Failed to load session"}
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: "500px",
        margin: "0 auto",
        padding: "40px 30px",
        background: "rgba(255, 255, 255, 0.05)",
        borderRadius: "16px",
        backdropFilter: "blur(10px)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
      }}
    >
      <h1
        style={{
          fontSize: "24px",
          fontWeight: 600,
          margin: "0 0 8px",
          color: "#fff",
        }}
      >
        {status.template.title}
      </h1>

      {status.template.description && (
        <p
          style={{
            color: "#a0a0a0",
            marginBottom: "32px",
            lineHeight: 1.5,
          }}
        >
          {status.template.description}
        </p>
      )}

      {error && (
        <div
          style={{
            padding: "12px 16px",
            marginBottom: "16px",
            background: "rgba(248, 113, 113, 0.1)",
            border: "1px solid rgba(248, 113, 113, 0.3)",
            borderRadius: "8px",
            color: "#f87171",
            fontSize: "14px",
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        {status.apps.map((app) => (
          <AppCard
            key={app.app_name}
            app={app}
            onConnect={() => handleConnect(app.app_name)}
            loading={configuring === app.app_name}
          />
        ))}

        {allConfigured && status.apps.length > 0 && (
          <button
            onClick={handleComplete}
            disabled={completing}
            style={{
              width: "100%",
              marginTop: "20px",
              padding: "16px",
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              border: "none",
              borderRadius: "8px",
              color: "white",
              fontWeight: 500,
              cursor: completing ? "not-allowed" : "pointer",
              opacity: completing ? 0.5 : 1,
              fontSize: "16px",
            }}
          >
            {completing ? "Completing..." : "Complete Setup"}
          </button>
        )}
      </div>

      <div
        style={{
          marginTop: "24px",
          paddingTop: "24px",
          borderTop: "1px solid rgba(255, 255, 255, 0.1)",
          fontSize: "13px",
          color: "#666",
        }}
      >
        Session expires: {new Date(status.session.expires_at).toLocaleString()}
      </div>
    </div>
  );
}
