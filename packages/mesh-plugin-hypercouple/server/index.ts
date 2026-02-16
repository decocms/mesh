/**
 * Hypercouple Plugin - Server Entry Point
 *
 * Minimal server plugin for Phase 4.
 * Tools and storage will be added in later phases.
 */

import type { ServerPlugin } from "@decocms/bindings/server-plugin";
import { PLUGIN_ID, PLUGIN_DESCRIPTION } from "../shared";

export const serverPlugin: ServerPlugin = {
  id: PLUGIN_ID,
  description: PLUGIN_DESCRIPTION,
};
