/**
 * Universal Webhook Proxy
 *
 * Receives webhooks from external services and forwards to MCP's handle_webhook tool.
 * The MCP is responsible for challenge handling, signature verification, and processing.
 *
 * URL: /webhooks/:org/:connectionId
 */

import { Hono } from "hono";
import type { MeshContext } from "../../core/mesh-context";

type HonoEnv = {
  Variables: { meshContext: MeshContext };
};

const app = new Hono<HonoEnv>();

app.all("/:org/:connectionId", async (c) => {
  const orgSlug = c.req.param("org");
  const connectionId = c.req.param("connectionId");
  const ctx = c.get("meshContext");

  // Look up connection with org validation
  const connection = await ctx.db
    .selectFrom("connections")
    .innerJoin("organization", "organization.id", "connections.organization_id")
    .select([
      "connections.id",
      "connections.organization_id",
      "connections.status",
      "connections.connection_url",
      "organization.slug",
    ])
    .where("connections.id", "=", connectionId)
    .where("organization.slug", "=", orgSlug)
    .where("connections.status", "=", "active")
    .executeTakeFirst();

  if (!connection) {
    return c.json({ error: "Not found" }, 404);
  }

  // Build request data for MCP tool
  const method = c.req.method;
  const url = c.req.url;
  const headers: Record<string, string> = {};
  c.req.raw.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const body = await c.req.text();

  // Call MCP's handle_webhook tool
  try {
    const mcpUrl = connection.connection_url;
    if (!mcpUrl) {
      return c.json({ error: "MCP not configured" }, 500);
    }

    const toolResponse = await fetch(mcpUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: crypto.randomUUID(),
        method: "tools/call",
        params: {
          name: "handle_webhook",
          arguments: {
            method,
            url,
            headers,
            body,
          },
        },
      }),
    });

    if (!toolResponse.ok) {
      console.error("[Webhooks] MCP tool call failed:", toolResponse.status);
      return c.json({ error: "MCP error" }, 502);
    }

    const result = await toolResponse.json();

    // Check for JSON-RPC error
    if (result.error) {
      // Tool not found = MCP doesn't support webhooks
      if (result.error.code === -32601) {
        return c.json({ error: "Webhooks not supported" }, 400);
      }
      console.error("[Webhooks] MCP returned error:", result.error);
      return c.json({ error: "MCP error" }, 502);
    }

    // Extract response from tool result
    const toolResult = result.result;
    if (!toolResult?.content?.[0]?.text) {
      return c.json({ error: "Invalid MCP response" }, 502);
    }

    const webhookResponse = JSON.parse(toolResult.content[0].text);

    // Build response from MCP's instructions
    const responseHeaders = new Headers();
    if (webhookResponse.headers) {
      for (const [key, value] of Object.entries(webhookResponse.headers)) {
        responseHeaders.set(key, value as string);
      }
    }

    return new Response(webhookResponse.body ?? "", {
      status: webhookResponse.status ?? 200,
      headers: responseHeaders,
    });
  } catch (err) {
    console.error("[Webhooks] Error calling MCP:", err);
    return c.json({ error: "Internal error" }, 500);
  }
});

app.get("/health", (c) => c.json({ status: "ok" }));

export default app;
