/**
 * Plugin Context Provider Types
 *
 * The runtime implementations (PluginContextProvider, usePluginContext)
 * have moved to @decocms/mesh-sdk/plugins. Only types remain here
 * for backwards compatibility.
 */

import type { Binder } from "./binder";
import type { PluginContext, PluginContextPartial } from "./plugin-context";
import type { ReactNode } from "react";

export interface PluginContextProviderProps<TBinding extends Binder> {
  value: PluginContext<TBinding> | PluginContextPartial<TBinding>;
  children: ReactNode;
}

/**
 * Options for usePluginContext hook.
 */
export interface UsePluginContextOptions {
  /**
   * Set to true when calling from an empty state component.
   * This returns nullable connection fields since no valid connection exists.
   */
  partial?: boolean;
}
