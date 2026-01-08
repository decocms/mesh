import { createRoute, lazyRouteComponent, Route } from "@tanstack/react-router";
import { Binder } from "./binder";
import type { ReactNode } from "react";
import { Tool } from "@modelcontextprotocol/sdk/types";
import { MCPConnection } from "./connection";

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
  registerRootPluginRoute: (route: Route) => void;
}

export type PluginSetup = (context: PluginSetupContext) => void;

export interface Plugin<TBinding extends Binder> {
  id: string;
  binding: TBinding;
  setup: PluginSetup;
}

export type AnyPlugin = Plugin<any>;