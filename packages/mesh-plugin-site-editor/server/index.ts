/**
 * Site Editor Plugin - Server Entry Point
 *
 * Minimal ServerPlugin stub. Extended in plan 17-06 with commit-message route.
 */

import type { ServerPlugin } from "@decocms/bindings/server-plugin";
import { PLUGIN_ID, PLUGIN_DESCRIPTION } from "../shared";

export const serverPlugin: ServerPlugin = {
  id: PLUGIN_ID,
  description: PLUGIN_DESCRIPTION,
  routes: (_app, _ctx) => {
    // commit-message route added in plan 17-06
  },
};
