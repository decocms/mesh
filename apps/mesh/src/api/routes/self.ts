/**
 * Self MCP Server
 *
 * Exposes MCP Mesh management tools via MCP protocol at /mcp/self endpoint
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
 * MCP Server endpoint for self-management tools
 *
 * Route: POST /mcp/self
 * Exposes all PROJECT_* and CONNECTION_* tools via MCP protocol
 */
app.all("/", async (c) => {
  if (c.req.method === "GET") {
    return c.text("Method not allowed", 405, {
      "Content-Type": "text/plain",
    });
  }

  const mcp = await managementMCP(c.get("meshContext"));
  return mcp.fetch(c.req.raw);
});

export default app;
