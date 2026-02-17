/**
 * Plugin Layout
 *
 * Generic layout for plugins that filters connections by binding
 * and provides PluginContext to plugin routes.
 *
 * Connection selection is controlled by project settings (plugin bindings).
 * If no connection is configured for the plugin, the plugin's own empty
 * state is shown so it can guide the user through setup.
 */

import {
  Binder,
  resolveToolNames,
  PluginConnectionEntity,
  PluginContext,
  PluginContextPartial,
  PluginSession,
} from "@decocms/bindings";
import type { PluginRenderHeaderProps } from "@decocms/bindings/plugins";
import { PluginContextProvider } from "@decocms/mesh-sdk/plugins";
import {
  SELF_MCP_ALIAS_ID,
  useConnections,
  useMCPClient,
  useMCPClientOptional,
  useProjectContext,
  type ConnectionEntity,
} from "@decocms/mesh-sdk";
import { authClient } from "@/web/lib/auth-client";
import { Outlet, useLocation, useParams } from "@tanstack/react-router";
import { Loading01 } from "@untitledui/icons";
import { Suspense, useRef, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { KEYS } from "@/web/lib/query-keys";
import { Page } from "@/web/components/page";

interface PluginLayoutProps {
  /**
   * The binding to filter connections by.
   * Only connections implementing this binding will be available.
   */
  binding: Binder;

  /**
   * Render the header with connection selector.
   * Receives the list of valid connections and current selection handlers.
   */
  renderHeader: (props: PluginRenderHeaderProps) => ReactNode;

  /**
   * Render the empty state when no valid connections are available.
   */
  renderEmptyState: () => ReactNode;

  /**
   * Optional connection ID override. When provided, this takes priority
   * over the project plugin config's connectionId. Used by the site editor
   * for multi-site switching via the site store.
   */
  connectionIdOverride?: string | null;
}

/**
 * Converts a ConnectionEntity to PluginConnectionEntity.
 */
function toPluginConnectionEntity(
  conn: ConnectionEntity,
): PluginConnectionEntity {
  return {
    id: conn.id,
    title: conn.title,
    icon: conn.icon,
    description: conn.description,
    app_name: conn.app_name,
    app_id: conn.app_id,
    tools: conn.tools,
    metadata: conn.metadata,
  };
}

/**
 * Extracts text content from an MCP tool result.
 * Standard MCP tools return { content: [{ type: "text", text: "..." }] }.
 */
function extractMCPText(result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const r = result as Record<string, unknown>;
  // Check structuredContent.content first (newer MCP tools return this)
  if (r.structuredContent && typeof r.structuredContent === "object") {
    const sc = r.structuredContent as Record<string, unknown>;
    if (typeof sc.content === "string") return sc.content;
  }
  // Fall back to content array
  if (Array.isArray(r.content)) {
    return (r.content as Array<{ type?: string; text?: string }>)
      .filter((c) => c.type === "text" && c.text)
      .map((c) => c.text)
      .join("\n");
  }
  return "";
}

/**
 * Make a relative path absolute by prepending the root directory.
 * Matches the server-side site-proxy behavior.
 */
function toAbsolute(rootDir: string | null, relativePath: string): string {
  if (!rootDir || relativePath.startsWith("/")) return relativePath;
  return `${rootDir.replace(/\/$/, "")}/${relativePath}`;
}

/**
 * Adapts binding tool inputs to match the aliased tool's expected schema.
 * E.g. LIST_FILES({ prefix }) → list_directory({ path }).
 * Resolves relative paths to absolute using the discovered root directory.
 */
function adaptToolInput(
  canonicalName: string,
  args: Record<string, unknown>,
  rootDir: string | null,
): Record<string, unknown> {
  switch (canonicalName) {
    case "LIST_FILES":
      // LIST_FILES({ prefix }) → list_directory({ path })
      return { path: toAbsolute(rootDir, (args.prefix as string) || ".") };
    case "READ_FILE":
      return { path: toAbsolute(rootDir, (args.path as string) || "") };
    case "PUT_FILE":
      return {
        path: toAbsolute(rootDir, (args.path as string) || ""),
        content: args.content,
      };
    default:
      return args;
  }
}

/**
 * Adapts standard MCP tool responses to match binding output schemas.
 * This bridges the gap between e.g. @modelcontextprotocol/server-filesystem
 * responses and the structured formats bindings expect.
 */
function adaptToolResponse(
  canonicalName: string,
  rawResult: unknown,
  originalArgs?: Record<string, unknown>,
): unknown {
  const text = extractMCPText(rawResult);

  switch (canonicalName) {
    case "READ_FILE":
      // read_file returns text content → { content: string }
      return { content: text };

    case "PUT_FILE":
      // write_file returns confirmation text → { success: boolean }
      return { success: true };

    case "LIST_FILES": {
      // list_directory returns lines like "[FILE] name.json" and "[DIR] subdir"
      // We need to reconstruct full paths relative to the queried prefix.
      const lines = text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const prefix = (originalArgs?.prefix as string) ?? "";
      const files = lines
        .filter((l) => l.startsWith("[FILE]"))
        .map((l) => {
          const name = l.replace("[FILE]", "").trim();
          const fullPath =
            prefix && prefix !== "."
              ? `${prefix.replace(/\/$/, "")}/${name}`
              : name;
          return { path: fullPath, sizeInBytes: 0, mtime: 0 };
        });
      return { files, count: files.length };
    }

    default:
      return rawResult;
  }
}

/**
 * Plugin layout component that filters connections by binding
 * and provides PluginContext to children.
 *
 * Always provides context (for session/org access) even when no
 * valid connections are available. Connection-related fields are
 * null in that case.
 */
type PluginConfigOutput = {
  config: {
    id: string;
    projectId: string;
    pluginId: string;
    connectionId: string | null;
    settings: Record<string, unknown> | null;
  } | null;
};

export function PluginLayout({
  binding,
  renderHeader,
  renderEmptyState,
  connectionIdOverride,
}: PluginLayoutProps) {
  const { org, project } = useProjectContext();
  // Extract pluginId from params ($pluginId catch-all) or URL path (static routes)
  const params = useParams({ strict: false }) as { pluginId?: string };
  const location = useLocation();
  const pluginId =
    params.pluginId ?? location.pathname.split("/").filter(Boolean)[2] ?? "";
  const allConnections = useConnections();
  const { data: authSession } = authClient.useSession();

  // Fetch project's plugin config to get configured connection
  const selfClient = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  const { data: pluginConfig, isLoading: isLoadingConfig } = useQuery({
    queryKey: KEYS.projectPluginConfig(project.id ?? "", pluginId),
    queryFn: async () => {
      const result = (await selfClient.callTool({
        name: "PROJECT_PLUGIN_CONFIG_GET",
        arguments: {
          projectId: project.id,
          pluginId,
        },
      })) as { structuredContent?: unknown };
      return (result.structuredContent ?? result) as PluginConfigOutput;
    },
    enabled: !!project.id && !!pluginId,
  });

  // Connection is determined by override (multi-site) or project config.
  // Look up from allConnections (not validConnections) because a newly created
  // STDIO connection may not have its tools populated yet, which would fail
  // the binding check in filterConnectionsByBinding.
  const configuredConnectionId =
    connectionIdOverride ?? pluginConfig?.config?.connectionId;
  const configuredConnection = configuredConnectionId
    ? ((allConnections ?? []).find((c) => c.id === configuredConnectionId) ??
      null)
    : null;

  // Call hook unconditionally - pass undefined to skip when no valid configured connection
  // This must be called before any early returns to satisfy React's Rules of Hooks
  const configuredClient = useMCPClientOptional({
    connectionId: configuredConnection?.id,
    orgId: org.id,
  });

  // Cache the discovered root directory for the filesystem MCP.
  // Must be called before early returns to satisfy React's Rules of Hooks.
  // undefined = not yet discovered, null = discovery failed/not applicable, string = root path.
  const rootDirRef = useRef<string | null | undefined>(undefined);
  const prevConnectionIdRef = useRef<string | null | undefined>(undefined);

  // Reset cached root dir when connection changes (multi-site switching)
  if (prevConnectionIdRef.current !== configuredConnectionId) {
    prevConnectionIdRef.current = configuredConnectionId;
    rootDirRef.current = undefined;
  }

  // Build session for context (always available)
  const session: PluginSession | null = authSession?.user
    ? {
        user: {
          id: authSession.user.id,
          name: authSession.user.name,
          email: authSession.user.email,
          image: authSession.user.image,
        },
      }
    : null;

  // Build org context (always available)
  const orgContext = {
    id: org.id,
    slug: org.slug,
    name: org.name,
  };

  // Show loading state while fetching config
  if (isLoadingConfig) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Loading01
          size={32}
          className="animate-spin text-muted-foreground mb-4"
        />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  // If no configured connection, show the plugin's empty state
  if (!configuredConnection) {
    const emptyContext: PluginContextPartial<Binder> = {
      connectionId: null,
      connection: null,
      toolCaller: null,
      org: orgContext,
      session,
    };

    return (
      <PluginContextProvider value={emptyContext}>
        <div className="h-full flex flex-col overflow-hidden">
          {renderEmptyState()}
        </div>
      </PluginContextProvider>
    );
  }

  // Build tool name mapping for aliased connections (e.g. read_file → READ_FILE)
  const toolNameMap = resolveToolNames(configuredConnection, binding);

  /**
   * Discovers the root directory by calling list_allowed_directories on the
   * MCP connection. Caches the result so subsequent tool calls are instant.
   */
  const discoverRootDir = async (): Promise<string | null> => {
    if (rootDirRef.current !== undefined) return rootDirRef.current;
    if (!configuredClient) {
      rootDirRef.current = null;
      return null;
    }
    try {
      const result = await configuredClient.callTool({
        name: "list_allowed_directories",
        arguments: {},
      });
      const text = extractMCPText(result);
      const lines = text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      rootDirRef.current = lines.find((l) => l.startsWith("/")) ?? null;
    } catch {
      rootDirRef.current = null;
    }
    return rootDirRef.current;
  };

  // Create the plugin context with connection
  // TypedToolCaller is generic - the plugin will cast it to the correct binding type
  const pluginContext: PluginContext<Binder> = {
    connectionId: configuredConnection.id,
    connection: toPluginConnectionEntity(configuredConnection),
    // The toolCaller accepts any tool name and args at runtime
    // Type safety is enforced by the plugin using usePluginContext<MyBinding>()
    toolCaller: ((toolName: string, args: unknown) =>
      configuredClient
        ? (async () => {
            const isAliased = !!toolNameMap[toolName];
            // Discover root directory on first aliased tool call
            const rootDir = isAliased ? await discoverRootDir() : null;

            const result = await configuredClient.callTool({
              name: toolNameMap[toolName] ?? toolName,
              arguments: (isAliased
                ? adaptToolInput(
                    toolName,
                    args as Record<string, unknown>,
                    rootDir,
                  )
                : args) as Record<string, unknown>,
            });

            if (isAliased) {
              return adaptToolResponse(
                toolName,
                result,
                args as Record<string, unknown>,
              );
            }
            const payload = result.structuredContent ?? result;
            return payload;
          })()
        : Promise.reject(
            new Error("MCP client is not available"),
          )) as PluginContext<Binder>["toolCaller"],
    org: orgContext,
    session,
  };

  return (
    <PluginContextProvider
      key={pluginContext.connectionId}
      value={pluginContext}
    >
      <Page>
        <Page.Header>
          <Page.Header.Left>
            {renderHeader({
              // Only show the configured connection (read-only display)
              connections: [toPluginConnectionEntity(configuredConnection)],
              selectedConnectionId: configuredConnection.id,
              // No-op since connection is controlled by project settings
              onConnectionChange: () => {},
            })}
          </Page.Header.Left>
        </Page.Header>
        <Page.Content>
          <Suspense
            fallback={
              <div className="flex flex-col items-center justify-center h-full">
                <Loading01
                  size={32}
                  className="animate-spin text-muted-foreground mb-4"
                />
                <p className="text-sm text-muted-foreground">Loading...</p>
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </Page.Content>
      </Page>
    </PluginContextProvider>
  );
}
