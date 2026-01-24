/**
 * User Sandbox Plugin - Client Entry Point
 *
 * Exports the ClientPlugin implementation with UI setup.
 * Only import this file from client code to avoid bundling server code.
 */

import type { ClientPlugin } from "@decocms/bindings/plugins";
import type { Binder } from "@decocms/bindings";
import { PLUGIN_ID, PLUGIN_DESCRIPTION } from "../shared";

// Empty binding for user sandbox plugin (no custom tools on client side)
// This plugin primarily provides server-side functionality
const USER_SANDBOX_BINDING = [] as const satisfies Binder;

export const clientPlugin: ClientPlugin<typeof USER_SANDBOX_BINDING> = {
  id: PLUGIN_ID,
  description: PLUGIN_DESCRIPTION,
  binding: USER_SANDBOX_BINDING,

  // Setup function for registering routes and sidebar items (Phase 2 - Dashboard UI)
  // setup: (context) => {
  //   // Register dashboard routes for template management
  // },
};

// Re-export components for use in standalone connect flow
export { ConnectFlow } from "./components";
