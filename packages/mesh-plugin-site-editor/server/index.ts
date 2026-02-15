/**
 * Site Editor Plugin - Server Entry Point
 *
 * Provides site file management tools (pages, sections, loaders).
 * Tools have access to the mesh database (via Kysely) and MCP proxy.
 */

import type { ServerPlugin } from "@decocms/bindings/server-plugin";
import { PLUGIN_ID, PLUGIN_DESCRIPTION } from "../shared";
import { tools } from "./tools";

export const serverPlugin: ServerPlugin = {
  id: PLUGIN_ID,
  description: PLUGIN_DESCRIPTION,

  // MCP tools (added in plan 01-03)
  tools,
};
