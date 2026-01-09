import { createRoute, lazyRouteComponent, Route } from "@tanstack/react-router";
import { Binder } from "./binder";
import type { ReactNode } from "react";

export interface ToolViewItem {
  toolName: string;
  label: string;
  icon: ReactNode;
}

export interface RegisterRootSidebarItemParams {
  icon: ReactNode;
  label: string;
}

export interface RegisterEmptyStateParams {
  component: ReactNode;
}

export interface PluginSetupContext {
  parentRoute: Route;
  routing: {
    createRoute: typeof createRoute;
    lazyRouteComponent: typeof lazyRouteComponent;
  };
  registerRootSidebarItem: (params: RegisterRootSidebarItemParams) => void;
  registerPluginRoutes: (route: Route[]) => void;
}

export type PluginSetup = (context: PluginSetupContext) => void;

export interface Plugin<TBinding extends Binder> {
  id: string;
  binding: TBinding;
  setup: PluginSetup;
}

export type AnyPlugin = Plugin<any>;

// Re-export plugin router utilities
export {
  createPluginRouter,
  type PluginRouteIds,
  type PluginRoutes,
  type AnyRoute,
  type RouteIds,
  type RouteById,
} from "./plugin-router";
