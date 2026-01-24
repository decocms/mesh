/**
 * User Sandbox Plugin - Server Entry Point
 *
 * Exports the ServerPlugin implementation with tools, routes, migrations, and storage.
 * Only import this file from server code to avoid bundling in the client.
 */

import type { ServerPlugin } from "@decocms/bindings/server-plugin";
import { PLUGIN_ID, PLUGIN_DESCRIPTION } from "../shared";
import { migrations } from "./migrations";
import { createStorage, type UserSandboxPluginStorage } from "./storage";
import { tools, setPluginStorage } from "./tools";
import { connectRoutes } from "./routes";

export const serverPlugin: ServerPlugin = {
  id: PLUGIN_ID,
  description: PLUGIN_DESCRIPTION,

  // MCP tools
  tools,

  // Public routes for the connect flow (no Mesh auth required)
  publicRoutes: (app, ctx) => {
    connectRoutes(app, ctx);
  },

  // Database migrations
  migrations,

  // Storage factory - also sets up the plugin storage singleton for tools
  createStorage: (ctx) => {
    const storage = createStorage(ctx);
    setPluginStorage(storage as UserSandboxPluginStorage);
    return storage;
  },
};
