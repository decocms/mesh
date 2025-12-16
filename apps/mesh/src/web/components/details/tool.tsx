import { createToolCaller, UNKNOWN_CONNECTION_ID } from "@/tools/client";
import { useConnection } from "@/web/hooks/collections/use-connection";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@deco/ui/components/alert.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { Textarea } from "@deco/ui/components/textarea.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { useParams } from "@tanstack/react-router";
import {
  AlertCircle,
  Box,
  Clock,
  Code,
  Copy,
  Database,
  Loader2,
  Play,
  Plus,
} from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { useMcp } from "use-mcp/react";
import { normalizeUrl } from "@/web/utils/normalize-url";
import { PinToSidebarButton } from "../pin-to-sidebar-button";
import { ViewActions, ViewLayout } from "./layout";
import { OAuthAuthenticationState } from "./connection/settings-tab";
import { useIsMCPAuthenticated } from "@/web/hooks/use-oauth-token-validation";

export interface ToolDetailsViewProps {
  itemId: string;
  onBack: () => void;
  onUpdate: (updates: Record<string, unknown>) => Promise<void>;
}

const beautifyToolName = (toolName: string) => {
  return toolName
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toLocaleLowerCase());
};

function ToolDetailsContent({
  toolName,
  connectionId,
  connection,
  onBack,
}: {
  toolName: string;
  connectionId: string;
  connection: NonNullable<ReturnType<typeof useConnection>>;
  onBack: () => void;
}) {
  const mcpOriginalUrl = normalizeUrl(connection.connection_url);
  const mcpProxyUrl = new URL(`/mcp/${connectionId}`, window.location.origin);

  const isMCPAuthenticated = useIsMCPAuthenticated({
    url: mcpOriginalUrl,
    token: connection.connection_token ?? null,
  });

  if (!isMCPAuthenticated) {
    return (
      <div className="flex h-full items-center justify-center">
        <OAuthAuthenticationState
          onAuthenticate={() => onBack()}
          buttonText="Go back"
        />
      </div>
    );
  }

  return (
    <ToolDetailsAuthenticated
      key={`${connectionId}:${toolName}`}
      toolName={toolName}
      connectionId={connectionId}
      mcpProxyUrl={mcpProxyUrl}
      onBack={onBack}
    />
  );
}

function ToolDetailsAuthenticated({
  toolName,
  connectionId,
  mcpProxyUrl,
  onBack,
}: {
  toolName: string;
  connectionId: string;
  mcpProxyUrl: URL;
  onBack: () => void;
}) {
  // Store only user edits; defaults are derived from the schema (no effect-driven initialization).
  const [editedParams, setEditedParams] = useState<Record<string, unknown>>({});
  const [executionResult, setExecutionResult] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [stats, setStats] = useState<{
    duration: string;
    tokens?: string;
    bytes?: string;
    cost?: string;
  } | null>(null);
  const [viewMode, setViewMode] = useState<"json" | "view">("json");

  const mcp = useMcp({
    url: mcpProxyUrl.href,
    clientName: "MCP Tool Inspector",
    clientUri: window.location.origin,
    autoReconnect: false,
  });

  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    if (mcp.error) {
      console.error("MCP Error:", mcp.error);
    }
  }, [mcp.error]);

  // Find the tool definition
  const tool = mcp.tools?.find((t) => t.name === toolName);

  const toolProperties = tool?.inputSchema?.properties;
  const toolPropertyKeys = toolProperties ? Object.keys(toolProperties) : [];
  const hasToolProperties = toolPropertyKeys.length > 0;

  const defaultParams: Record<string, unknown> = {};
  if (hasToolProperties && tool?.inputSchema?.properties) {
    for (const key of toolPropertyKeys) {
      defaultParams[key] = tool.inputSchema.required?.includes(key)
        ? ""
        : undefined;
    }
  }

  const hasEditedKey = (key: string) =>
    Object.prototype.hasOwnProperty.call(editedParams, key);

  const handleExecute = async () => {
    setIsExecuting(true);
    setExecutionError(null);
    setExecutionResult(null);
    setStats(null);

    const startTime = performance.now();
    const toolCaller = createToolCaller(connectionId);

    try {
      // Prepare arguments: try to parse JSON for object/array types
      const args = { ...defaultParams, ...editedParams };
      if (tool?.inputSchema?.properties) {
        Object.entries(tool.inputSchema.properties).forEach(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ([key, prop]: [string, any]) => {
            if (
              (prop.type === "object" || prop.type === "array") &&
              typeof args[key] === "string"
            ) {
              try {
                args[key] = JSON.parse(args[key]);
              } catch {
                // Parsing failed, send as string (will likely fail validation but let server handle it)
              }
            }
          },
        );
      }

      const result = await toolCaller(toolName, args);

      const endTime = performance.now();
      const durationMs = Math.round(endTime - startTime);

      setExecutionResult(result as Record<string, unknown>);

      // Calculate mocked stats based on result size
      const resultStr = JSON.stringify(result);
      const bytes = new TextEncoder().encode(resultStr).length;

      setStats({
        duration: `${durationMs}ms`,
        bytes: `${bytes} bytes`,
        // Mocking tokens/cost as we don't have real data for that yet
        tokens: `~${Math.ceil(bytes / 4)} tokens`,
        cost: "$0.0000",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setExecutionError(message || "Unknown error occurred");
      const endTime = performance.now();
      setStats({
        duration: `${Math.round(endTime - startTime)}ms`,
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleInputChange = (key: string, value: string) => {
    setEditedParams((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <ViewLayout onBack={onBack}>
      <ViewActions>
        <PinToSidebarButton
          connectionId={connectionId}
          title={tool?.title ?? beautifyToolName(toolName)}
          icon="build"
        />
      </ViewActions>

      <div className="flex flex-col items-center w-full max-w-[1500px] mx-auto p-10 gap-4">
        {/* Tool Title & Description */}
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-2xl font-medium text-foreground">{toolName}</h1>
          <p className="text-muted-foreground text-base">
            {tool?.description || "No description available"}
          </p>
        </div>

        {/* Stats Row */}
        <div className="flex items-center gap-4 py-2">
          {/* MCP Status */}
          <div className="flex items-center gap-2">
            {mcp.state === "ready" ? (
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            ) : mcp.state === "connecting" || mcp.state === "authenticating" ? (
              <Loader2 className="h-3 w-3 animate-spin text-yellow-500" />
            ) : (
              <div className="h-2 w-2 rounded-full bg-red-500" />
            )}
            <span className="font-mono text-sm capitalize text-muted-foreground">
              {mcp.state.replace("_", " ")}
            </span>
          </div>
          <div className="w-px h-4 bg-border" />

          {/* Execution Stats */}
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="font-mono text-sm">{stats?.duration || "-"}</span>
          </div>
          <div className="w-px h-4 bg-border" />
          <div className="flex items-center gap-2">
            <Box className="h-4 w-4 text-muted-foreground" />
            <span className="font-mono text-sm">{stats?.tokens || "-"}</span>
          </div>
          <div className="w-px h-4 bg-border" />
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            <span className="font-mono text-sm">{stats?.bytes || "-"}</span>
          </div>
        </div>

        {/* Error Alert */}
        {executionError && (
          <Alert
            variant="destructive"
            className="max-w-[800px] w-full bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900"
          >
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Execution Failed</AlertTitle>
            <AlertDescription>{executionError}</AlertDescription>
          </Alert>
        )}

        {/* Main Content Area */}
        <div className="flex flex-col gap-4 w-full max-w-[800px] items-center">
          {/* Input Section */}
          <div className="w-full bg-card border border-border rounded-xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded-sm bg-primary/10 flex items-center justify-center">
                  <Play className="h-3 w-3 text-primary" />
                </div>
                <span className="font-medium text-sm">Input</span>
              </div>
              <Button
                size="sm"
                variant="default"
                className="h-8 gap-2"
                onClick={handleExecute}
                disabled={isExecuting}
              >
                {isExecuting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5 fill-current" />
                )}
                Execute tool
              </Button>
            </div>

            <div className="p-4 space-y-4">
              <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                Arguments
              </div>

              {hasToolProperties && tool?.inputSchema?.properties ? (
                Object.entries(tool.inputSchema.properties).map(
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  ([key, prop]: [string, any]) => (
                    <div key={key} className="space-y-2">
                      <div className="flex items-baseline gap-2">
                        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                          {key}
                        </label>
                        {tool.inputSchema?.required?.includes(key) && (
                          <span className="text-red-500 text-xs">*</span>
                        )}
                        <span className="text-xs text-muted-foreground ml-auto">
                          {prop.type}
                        </span>
                      </div>
                      {prop.description && (
                        <p className="text-xs text-muted-foreground mb-1">
                          {prop.description}
                        </p>
                      )}
                      {prop.type === "object" || prop.type === "array" ? (
                        <Textarea
                          className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                          value={
                            hasEditedKey(key)
                              ? ((editedParams[key] as string) ?? "")
                              : ((defaultParams[key] as string) ?? "")
                          }
                          onChange={(e) =>
                            handleInputChange(key, e.target.value)
                          }
                          placeholder={`Enter ${key} as JSON...`}
                        />
                      ) : (
                        <Input
                          value={
                            hasEditedKey(key)
                              ? ((editedParams[key] as string) ?? "")
                              : ((defaultParams[key] as string) ?? "")
                          }
                          onChange={(e) =>
                            handleInputChange(key, e.target.value)
                          }
                          placeholder={`Enter ${key}...`}
                        />
                      )}
                    </div>
                  ),
                )
              ) : (
                <div className="text-sm text-muted-foreground italic">
                  No arguments defined in schema.
                </div>
              )}

              {/* Fallback for no properties but valid schema */}
              {tool?.inputSchema && !hasToolProperties && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Raw JSON Input</label>
                  <textarea
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={
                      typeof editedParams === "string"
                        ? editedParams
                        : JSON.stringify(editedParams, null, 2)
                    }
                    onChange={(e) => {
                      try {
                        setEditedParams(JSON.parse(e.target.value));
                      } catch {
                        // Allow typing invalid JSON momentarily, but maybe store as string in a separate state if we want robust editing
                        // For now, just let it be assuming user pastes valid JSON
                      }
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Output Section */}
          <div className="w-full bg-card border border-border rounded-xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
              <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                Execution Result
              </span>
              <div className="flex items-center bg-muted rounded-lg p-1 h-8">
                <button
                  onClick={() => setViewMode("json")}
                  className={cn(
                    "px-3 py-1 text-xs font-medium rounded-md transition-all",
                    viewMode === "json"
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  JSON
                </button>
                <button
                  onClick={() => setViewMode("view")}
                  className={cn(
                    "px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1",
                    viewMode === "view"
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  disabled
                  title="Coming soon"
                >
                  Create view
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            </div>

            <div className="relative min-h-[200px] max-h-[500px] overflow-auto bg-zinc-950 text-zinc-50 p-4 font-mono text-xs">
              {executionResult ? (
                <pre className="whitespace-pre-wrap break-all">
                  {JSON.stringify(executionResult, null, 2)}
                </pre>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-700">
                  <Code className="h-8 w-8 mb-2 opacity-50" />
                  <p>Run the tool to see results</p>
                </div>
              )}

              {executionResult && (
                <div className="absolute top-4 right-4 flex gap-2">
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-8 w-8 bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 border-zinc-700"
                    onClick={() => {
                      navigator.clipboard.writeText(
                        JSON.stringify(executionResult, null, 2),
                      );
                      toast.success("Copied to clipboard");
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </ViewLayout>
  );
}

export function ToolDetailsView({
  itemId: toolName,
  onBack,
}: ToolDetailsViewProps) {
  const params = useParams({ strict: false });
  const connectionId = params.connectionId ?? UNKNOWN_CONNECTION_ID;

  const connection = useConnection(connectionId);

  if (!connection) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-center">
          <h3 className="text-lg font-semibold">Connection not found</h3>
          <p className="text-sm text-muted-foreground">
            This connection may have been deleted or you may not have access.
          </p>
        </div>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <ToolDetailsContent
        toolName={toolName}
        connectionId={connectionId}
        connection={connection}
        onBack={onBack}
      />
    </Suspense>
  );
}
