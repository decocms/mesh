/**
 * STDIO Logs API
 *
 * Provides endpoints for fetching logs from STDIO MCP connections.
 * Used by the connection details UI to display process logs.
 */

import { getDb } from "@/database";
import { parseStdioUrl, stdioManager } from "@/stdio/stdio-manager";
import { Hono } from "hono";

const app = new Hono();

/**
 * GET /stdio/:connectionId/logs
 *
 * Get logs for a specific STDIO connection.
 * Query params:
 *   - since: Only return logs after this timestamp (ms)
 */
app.get("/:connectionId/logs", (c) => {
  const connectionId = c.req.param("connectionId");
  const since = c.req.query("since");

  const logs = stdioManager.getLogs(
    connectionId,
    since ? parseInt(since, 10) : undefined,
  );
  const info = stdioManager.getConnectionInfo(connectionId);

  return c.json({ logs, info });
});

/**
 * GET /stdio/:connectionId/info
 *
 * Get connection info for a specific STDIO connection.
 */
app.get("/:connectionId/info", (c) => {
  const connectionId = c.req.param("connectionId");
  const info = stdioManager.getConnectionInfo(connectionId);

  if (!info) {
    return c.json({ error: "Connection not found or not a STDIO connection" }, 404);
  }

  return c.json(info);
});

/**
 * GET /stdio
 *
 * List all STDIO connections.
 */
app.get("/", (c) => {
  const connections = stdioManager.list();
  return c.json({ connections });
});

/**
 * POST /stdio/:connectionId/restart
 *
 * Restart a STDIO connection.
 */
app.post("/:connectionId/restart", async (c) => {
  const connectionId = c.req.param("connectionId");
  await stdioManager.stop(connectionId);
  return c.json({
    success: true,
    message: `Connection ${connectionId} stopped. Will restart on next request.`,
  });
});

/**
 * POST /stdio/:connectionId/start
 *
 * Start a STDIO connection. Fetches connection details from DB and spawns the process.
 */
app.post("/:connectionId/start", async (c) => {
  const connectionId = c.req.param("connectionId");

  try {
    // Fetch connection from database
    const db = getDb();
    const connection = await db.db
      .selectFrom("connections")
      .selectAll()
      .where("id", "=", connectionId)
      .executeTakeFirst();

    if (!connection) {
      return c.json({ error: "Connection not found" }, 404);
    }

    if (connection.connection_type !== "STDIO") {
      return c.json({ error: "Not a STDIO connection" }, 400);
    }

    // Parse the stdio URL
    const stdioConfig = parseStdioUrl(connection.connection_url);
    if (!stdioConfig) {
      return c.json({ error: "Invalid STDIO URL" }, 400);
    }

    // Merge connection token into env if provided
    const env = { ...stdioConfig.env };
    if (connection.connection_token) {
      // Get env var name from headers, default to MCP_API_TOKEN
      const headers = connection.connection_headers as Record<string, string> | null;
      const envVarName = headers?.["X-Stdio-Env-Var"] || "MCP_API_TOKEN";
      env[envVarName] = connection.connection_token;
    }

    // Spawn the process
    await stdioManager.spawn({
      ...stdioConfig,
      id: connectionId,
      env,
    });

    return c.json({
      success: true,
      message: `Connection ${connectionId} started.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ error: message }, 500);
  }
});

export default app;

