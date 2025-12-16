/**
 * Management Tools MCP Server
 *
 * Exposes MCP Mesh management tools via MCP protocol at /mcp endpoint
 * Tools: PROJECT_CREATE, PROJECT_LIST, CONNECTION_CREATE, etc.
 */
import { Hono } from "hono";
import type { MeshContext } from "../../core/mesh-context";
import { managementMCP } from "../../tools";

// Define Hono variables type
type Variables = {
  meshContext: MeshContext;
};

const app = new Hono<{ Variables: Variables }>();

/**
 * MCP Server endpoint for management tools
 *
 * Route: POST /mcp
 * Exposes all PROJECT_* and CONNECTION_* tools via MCP protocol
 */
app.all("/", async (c) => {
  return managementMCP(c.get("meshContext")).fetch(c.req.raw);
});

export default app;
