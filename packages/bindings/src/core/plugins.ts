import {
  createRoute,
  lazyRouteComponent,
  type AnyRoute,
} from "@tanstack/react-router";
import { Binder } from "./binder";
import type { ReactNode } from "react";
import type { PluginConnectionEntity } from "./plugin-context";

export interface ToolViewItem {
  toolName: string;
  label: string;
  icon: ReactNode;
}

export interface RegisterRootSidebarItemParams {
  icon: ReactNode;
  label: string;
}

export interface RegisterSidebarGroupParams {
  id: string;
  label: string;
  items: RegisterRootSidebarItemParams[];
  defaultExpanded?: boolean;
}

export interface RegisterEmptyStateParams {
  component: ReactNode;
}

export interface PluginSetupContext {
  parentRoute: AnyRoute;
  routing: {
    createRoute: typeof createRoute;
    lazyRouteComponent: typeof lazyRouteComponent;
  };
  registerRootSidebarItem: (params: RegisterRootSidebarItemParams) => void;
  registerSidebarGroup: (params: RegisterSidebarGroupParams) => void;
  registerPluginRoutes: (route: AnyRoute[]) => void;
}

export type PluginSetup = (context: PluginSetupContext) => void;

/**
 * Props passed to plugin's renderHeader function.
 */
export interface PluginRenderHeaderProps {
  connections: PluginConnectionEntity[];
  selectedConnectionId: string;
  onConnectionChange: (connectionId: string) => void;
}

/**
 * Client Plugin interface.
 *
 * Defines the contract for client-side plugins that extend the Mesh UI.
 * Client plugins are separate from server plugins to avoid bundling
 * server code into the client bundle.
 */
export interface ClientPlugin<TBinding extends Binder = Binder> {
  id: string;
  /**
   * Short description of the plugin shown in the settings UI.
   */
  description?: string;
  /**
   * Binding schema used to filter compatible connections.
   * Omit for plugins that manage their own connection (e.g. self MCP).
   */
  binding?: TBinding;
  setup?: PluginSetup;
  /**
   * Optional custom layout component for this plugin.
   * If not provided, a default layout with connection selector will be used.
   * @deprecated Use renderHeader and renderEmptyState instead.
   */
  LayoutComponent?: React.ComponentType;
  /**
   * Render the header with connection selector.
   * Receives the list of valid connections and current selection handlers.
   */
  renderHeader?: (props: PluginRenderHeaderProps) => ReactNode;
  /**
   * Render the empty state when no valid connections are available.
   */
  renderEmptyState?: () => ReactNode;
}

/**
 * @deprecated Use ClientPlugin instead
 */
export interface Plugin<TBinding extends Binder>
  extends ClientPlugin<TBinding> {
  setup: PluginSetup; // Required for backwards compatibility
}

export type AnyClientPlugin = ClientPlugin<Binder>;
export type AnyPlugin = Plugin<Binder>;

// Re-export plugin router utilities
export {
  createPluginRouter,
  type PluginRouteIds,
  type PluginRoutes,
  type AnyRoute,
  type RouteIds,
  type RouteById,
} from "./plugin-router";

// Note: PluginContextProvider and usePluginContext have been moved to @decocms/mesh-sdk/plugins.
// Types are re-exported here for backwards compatibility.
export type {
  PluginContextProviderProps,
  UsePluginContextOptions,
} from "./plugin-context-provider";
