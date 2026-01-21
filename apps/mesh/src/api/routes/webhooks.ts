/**
 * Universal Webhook Proxy Routes
 *
 * Provides webhook endpoints for MCP connections that need to receive
 * webhooks from external services (Slack, WhatsApp, GitHub, etc.)
 *
 * URL: POST /webhooks/:org/:connectionId
 *
 * Features:
 * - Auto-detection of webhook type (Slack, Meta, GitHub, generic)
 * - Signature verification using adapter-specific methods
 * - Challenge/verification handling for initial setup
 * - Event publishing to Event Bus for MCP processing
 *
 * Security:
 * - Validates org matches connection
 * - Verifies signatures before processing
 * - Minimal error details in responses
 */

import { Hono } from "hono";
import type { MeshContext } from "../../core/mesh-context";
import {
  getAdapter,
  detectAdapter,
  type WebhookAdapterType,
  type WebhookConfig,
} from "../webhook-adapters";

// ============================================================================
// Types
// ============================================================================

type Variables = {
  meshContext: MeshContext;
};

type HonoEnv = { Variables: Variables };

// ============================================================================
// Webhook Route
// ============================================================================

const app = new Hono<HonoEnv>();

/**
 * Universal webhook endpoint
 *
 * POST /webhooks/:org/:connectionId
 * GET /webhooks/:org/:connectionId (for Meta challenge verification)
 */
app.all("/:org/:connectionId", async (c) => {
  const orgSlug = c.req.param("org");
  const connectionId = c.req.param("connectionId");
  const ctx = c.get("meshContext");

  // Look up connection
  const connection = await ctx.storage.connections.findById(connectionId);

  if (!connection || connection.status !== "active") {
    return c.json({ error: "Not found" }, 404);
  }

  // Validate organization
  const organization = await ctx.db
    .selectFrom("organization")
    .select(["id", "slug"])
    .where("id", "=", connection.organization_id)
    .executeTakeFirst();

  if (!organization || organization.slug !== orgSlug) {
    return c.json({ error: "Not found" }, 404);
  }

  // Build webhook config from connection state
  const configState = (connection.configuration_state ?? {}) as Record<
    string,
    unknown
  >;
  const metadata = (connection.metadata ?? {}) as Record<string, unknown>;

  const webhookConfig: WebhookConfig = {
    connectionId,
    organizationId: connection.organization_id,
    ...configState,
  };

  // Parse body
  const rawBody = await c.req.text();
  let body: unknown = null;

  if (rawBody) {
    try {
      body = JSON.parse(rawBody);
    } catch {
      // Not JSON - could be form data or other format
    }
  }

  // Get adapter
  const explicitType = metadata.webhookType as WebhookAdapterType | undefined;
  const adapter = explicitType
    ? getAdapter(explicitType)
    : detectAdapter(c.req.raw, body);

  if (!adapter) {
    return c.json({ error: "Bad request" }, 400);
  }

  // Handle challenge (must be before signature verification for Slack)
  const challengeResponse = adapter.handleChallenge(
    c.req.raw,
    body,
    webhookConfig,
  );

  if (challengeResponse) {
    return challengeResponse;
  }

  // Verify signature
  const verification = await adapter.verify(c.req.raw, rawBody, webhookConfig);

  if (!verification.verified) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Publish event to Event Bus
  // Event Bus filters by publisher (connectionId) via SELF subscriptions
  const eventType = adapter.getEventType(body);
  const subject = adapter.getSubject?.(body);

  try {
    await ctx.eventBus.publish(
      connection.organization_id,
      connectionId,
      {
        type: eventType,
        data: body ?? rawBody,
        subject,
      },
    );
  } catch (err) {
    // Log error but still return 200 to acknowledge receipt
    console.error("[Webhooks] Event Bus publish failed:", err);
  }

  return c.json({ ok: true });
});

/**
 * Health check
 */
app.get("/health", (c) => {
  return c.json({ status: "ok", service: "webhooks" });
});

export default app;
