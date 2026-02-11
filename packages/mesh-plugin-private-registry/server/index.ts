import type { ServerPlugin } from "@decocms/bindings/server-plugin";
import { PLUGIN_DESCRIPTION, PLUGIN_ID } from "../shared";
import { migrations } from "./migrations";
import { publicMCPServerRoutes, publicRegistryRoutes } from "./routes";
import { createStorage } from "./storage";
import { tools } from "./tools";

export const serverPlugin: ServerPlugin = {
  id: PLUGIN_ID,
  description: PLUGIN_DESCRIPTION,
  tools,
  migrations,
  publicRoutes: (app, ctx) => {
    publicRegistryRoutes(app, ctx);
    publicMCPServerRoutes(app, ctx);
  },
  createStorage,
};
