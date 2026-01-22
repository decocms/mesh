/**
 * Plugin Layout
 *
 * Generic layout for plugins that filters connections by binding
 * and provides PluginContext to plugin routes.
 */

import {
  Binder,
  connectionImplementsBinding,
  PluginConnectionEntity,
  PluginContextProvider,
  PluginContext,
  PluginContextPartial,
  PluginSession,
} from "@decocms/bindings";
import type { PluginRenderHeaderProps } from "@decocms/bindings/plugins";
import { useLocalStorage } from "@/web/hooks/use-local-storage";
import {
  useConnections,
  useMCPClient,
  useProjectContext,
  type ConnectionEntity,
} from "@decocms/mesh-sdk";
import { LOCALSTORAGE_KEYS } from "@/web/lib/localstorage-keys";
import { authClient } from "@/web/lib/auth-client";
import { Outlet, useParams } from "@tanstack/react-router";
import { Loading01 } from "@untitledui/icons";
import { Suspense, type ReactNode } from "react";

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
}

/**
 * Filters connections that implement the given binding.
 */
function filterConnectionsByBinding(
  connections: ConnectionEntity[] | undefined,
  binding: Binder,
): ConnectionEntity[] {
  if (!connections) return [];
  return connections.filter((conn) =>
    connectionImplementsBinding(conn, binding),
  );
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
 * Plugin layout component that filters connections by binding
 * and provides PluginContext to children.
 *
 * Always provides context (for session/org access) even when no
 * valid connections are available. Connection-related fields are
 * null in that case.
 */
export function PluginLayout({
  binding,
  renderHeader,
  renderEmptyState,
}: PluginLayoutProps) {
  const { org } = useProjectContext();
  const { pluginId } = useParams({ strict: false }) as { pluginId: string };
  const allConnections = useConnections();
  const { data: authSession } = authClient.useSession();

  // Filter connections by the plugin's binding
  const validConnections = filterConnectionsByBinding(allConnections, binding);

  // Persist selected connection in localStorage
  const [selectedConnectionId, setSelectedConnectionId] =
    useLocalStorage<string>(
      LOCALSTORAGE_KEYS.pluginConnection(org.slug, pluginId),
      (existing) => existing ?? "",
    );

  // Find the selected connection, or default to first valid one
  const selectedConnection = validConnections.find(
    (c) => c.id === selectedConnectionId,
  );
  const effectiveConnection = selectedConnection ?? validConnections[0] ?? null;

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

  // If no valid connections, show empty state with partial context
  // Components using { partial: true } will get nullable connection fields
  if (validConnections.length === 0 || !effectiveConnection) {
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

  const client = useMCPClient({
    connectionId: effectiveConnection.id,
    orgSlug: org.slug,
  });

  // Create the plugin context with connection
  // TypedToolCaller is generic - the plugin will cast it to the correct binding type
  const pluginContext: PluginContext<Binder> = {
    connectionId: effectiveConnection.id,
    connection: toPluginConnectionEntity(effectiveConnection),
    // The toolCaller accepts any tool name and args at runtime
    // Type safety is enforced by the plugin using usePluginContext<MyBinding>()
    toolCaller: ((toolName: string, args: unknown) =>
      client
        ? client
            .callTool({
              name: toolName,
              arguments: args as Record<string, unknown>,
            })
            .then((result) => result.structuredContent ?? result)
        : Promise.reject(
            new Error("MCP client is not available"),
          )) as PluginContext<Binder>["toolCaller"],
    org: orgContext,
    session,
  };

  return (
    <PluginContextProvider value={pluginContext}>
      <div className="h-full flex flex-col overflow-hidden">
        {renderHeader({
          connections: validConnections.map(toPluginConnectionEntity),
          selectedConnectionId: effectiveConnection.id,
          onConnectionChange: setSelectedConnectionId,
        })}
        <div className="flex-1 overflow-hidden">
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
        </div>
      </div>
    </PluginContextProvider>
  );
}
