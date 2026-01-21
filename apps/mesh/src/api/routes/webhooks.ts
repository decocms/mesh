/**
 * Universal Webhook Proxy
 *
 * Receives webhooks from external services and publishes to Event Bus.
 * Each MCP connection can have its own webhook URL.
 *
 * URL: /webhooks/:org/:connectionId
 */

import { Hono } from "hono";
import type { MeshContext } from "../../core/mesh-context";
import { getAdapter, type WebhookAdapterType } from "../webhook-adapters";

type HonoEnv = {
  Variables: { meshContext: MeshContext };
};

const app = new Hono<HonoEnv>();

app.all("/:org/:connectionId", async (c) => {
  const orgSlug = c.req.param("org");
  const connectionId = c.req.param("connectionId");
  const ctx = c.get("meshContext");

  // Look up connection with org validation in single query
  const result = await ctx.db
    .selectFrom("connections")
    .innerJoin("organization", "organization.id", "connections.organization_id")
    .select([
      "connections.id",
      "connections.organization_id",
      "connections.status",
      "connections.configuration_state",
      "connections.metadata",
      "organization.slug",
    ])
    .where("connections.id", "=", connectionId)
    .where("organization.slug", "=", orgSlug)
    .where("connections.status", "=", "active")
    .executeTakeFirst();

  if (!result) {
    return c.json({ error: "Not found" }, 404);
  }

  // Get adapter from metadata
  const metadata = (result.metadata ?? {}) as Record<string, unknown>;
  const webhookType = metadata.webhookType as WebhookAdapterType | undefined;

  if (!webhookType) {
    return c.json({ error: "Bad request" }, 400);
  }

  const adapter = getAdapter(webhookType);
  if (!adapter) {
    return c.json({ error: "Bad request" }, 400);
  }

  // Parse request body
  const rawBody = await c.req.text();
  let body: unknown = null;
  if (rawBody) {
    try {
      body = JSON.parse(rawBody);
    } catch {
      // Keep as raw string
    }
  }

  // Build config for adapter
  const configState = (result.configuration_state ?? {}) as Record<
    string,
    unknown
  >;
  const config = {
    connectionId,
    organizationId: result.organization_id,
    ...configState,
  };

  // Handle challenge (before signature verification for Slack)
  const challengeResponse = adapter.handleChallenge(c.req.raw, body, config);
  if (challengeResponse) {
    return challengeResponse;
  }

  // Verify signature
  const verification = await adapter.verify(c.req.raw, rawBody, config);
  if (!verification.verified) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Publish to Event Bus
  try {
    await ctx.eventBus.publish(result.organization_id, connectionId, {
      type: adapter.getEventType(body),
      data: body ?? rawBody,
      subject: adapter.getSubject?.(body),
    });
  } catch (err) {
    console.error("[Webhooks] Event Bus publish failed:", err);
  }

  return c.json({ ok: true });
});

app.get("/health", (c) => c.json({ status: "ok" }));

export default app;
