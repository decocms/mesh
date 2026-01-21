/**
 * Universal Webhook Proxy Routes
 *
 * Provides webhook endpoints for MCP connections that need to receive
 * webhooks from external services (Slack, WhatsApp, GitHub, etc.)
 *
 * URL: POST /webhooks/:connectionId
 *
 * Features:
 * - Auto-detection of webhook type (Slack, Meta, GitHub, generic)
 * - Signature verification using adapter-specific methods
 * - Challenge/verification handling for initial setup
 * - Event publishing to Event Bus for MCP processing
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
 * POST /webhooks/:connectionId
 * GET /webhooks/:connectionId (for Meta challenge verification)
 *
 * Flow:
 * 1. Look up connection and configuration_state
 * 2. Detect or use explicit webhook adapter type
 * 3. Handle challenge if applicable (returns immediately)
 * 4. Verify signature (except for first challenge)
 * 5. Publish event to Event Bus
 */
app.all("/:connectionId", async (c) => {
  const connectionId = c.req.param("connectionId");
  const ctx = c.get("meshContext");

  console.log(`[Webhooks] Received request for connection: ${connectionId}`);
  console.log(`[Webhooks] Method: ${c.req.method}`);

  // ========================================================================
  // 1. Look up connection
  // ========================================================================

  const connection = await ctx.storage.connections.findById(connectionId);

  if (!connection) {
    console.error(`[Webhooks] Connection not found: ${connectionId}`);
    return c.json({ error: "Connection not found" }, 404);
  }

  if (connection.status !== "active") {
    console.error(`[Webhooks] Connection is not active: ${connectionId}`);
    return c.json({ error: "Connection is not active" }, 503);
  }

  console.log(`[Webhooks] Found connection: ${connection.title}`);
  console.log(`[Webhooks] Organization: ${connection.organization_id}`);

  // ========================================================================
  // 2. Build webhook config from connection state
  // ========================================================================

  const configState = (connection.configuration_state ?? {}) as Record<
    string,
    unknown
  >;
  const metadata = (connection.metadata ?? {}) as Record<string, unknown>;

  const webhookConfig: WebhookConfig = {
    connectionId,
    organizationId: connection.organization_id,
    // Common config fields from state
    signingSecret: configState.SIGNING_SECRET as string | undefined,
    appSecret:
      (configState.APP_SECRET as string | undefined) ||
      (configState.META_APP_SECRET as string | undefined),
    verifyToken:
      (configState.VERIFY_TOKEN as string | undefined) ||
      (configState.WEBHOOK_VERIFY_TOKEN as string | undefined),
    // Spread all state for adapter-specific fields
    ...configState,
  };

  // ========================================================================
  // 3. Parse body and detect adapter
  // ========================================================================

  // Clone request so we can read body multiple times
  const rawBody = await c.req.text();
  let body: unknown = null;

  // Try to parse as JSON (most webhooks are JSON)
  if (rawBody) {
    try {
      body = JSON.parse(rawBody);
    } catch {
      // Not JSON - could be form data or other format
      console.log(`[Webhooks] Body is not JSON, keeping as raw string`);
    }
  }

  // Get adapter - prefer explicit type from metadata, otherwise auto-detect
  const explicitType = metadata.webhookType as WebhookAdapterType | undefined;
  let adapter = explicitType
    ? getAdapter(explicitType)
    : detectAdapter(c.req.raw, body);

  // If no adapter detected, return error
  if (!adapter) {
    console.error(`[Webhooks] Could not detect webhook adapter type`);
    return c.json({ error: "Unknown webhook type" }, 400);
  }

  console.log(`[Webhooks] Using adapter: ${adapter.name} (${adapter.type})`);

  // ========================================================================
  // 4. Handle challenge (verification) requests
  // ========================================================================

  const challengeResponse = adapter.handleChallenge(
    c.req.raw,
    body,
    webhookConfig,
  );

  if (challengeResponse) {
    console.log(`[Webhooks] Challenge handled by ${adapter.name} adapter`);
    return challengeResponse;
  }

  // ========================================================================
  // 5. Verify signature (required for non-challenge requests)
  // ========================================================================

  // Skip verification for generic adapter or if no signing secret configured
  const shouldVerify =
    adapter.type !== "generic" &&
    (webhookConfig.signingSecret || webhookConfig.appSecret);

  if (shouldVerify) {
    const verification = await adapter.verify(
      c.req.raw,
      rawBody,
      webhookConfig,
    );

    if (!verification.verified) {
      console.error(
        `[Webhooks] Signature verification failed: ${verification.error}`,
      );
      return c.json(
        {
          error: "Signature verification failed",
          details: verification.error,
        },
        401,
      );
    }

    console.log(`[Webhooks] Signature verified successfully`);
  } else {
    console.log(
      `[Webhooks] Skipping signature verification (no secret configured or generic adapter)`,
    );
  }

  // ========================================================================
  // 6. Publish event to Event Bus
  // ========================================================================

  const eventType = adapter.getEventType(body);
  const subject = adapter.getSubject?.(body);

  console.log(`[Webhooks] Publishing event: ${eventType}`);
  if (subject) {
    console.log(`[Webhooks] Subject: ${subject}`);
  }

  try {
    await ctx.eventBus.publish(
      connection.organization_id,
      connectionId, // Publisher is the connection receiving the webhook
      {
        type: eventType,
        data: body ?? rawBody,
        subject,
      },
    );

    console.log(`[Webhooks] Event published successfully`);
  } catch (error) {
    console.error(`[Webhooks] Failed to publish event:`, error);
    // Still return 200 to acknowledge receipt
    // Event delivery will be retried by the Event Bus
  }

  // ========================================================================
  // 7. Acknowledge receipt
  // ========================================================================

  // Most webhook providers expect a quick 200 response
  return c.json({ ok: true });
});

/**
 * Health check for webhook endpoint
 */
app.get("/health", (c) => {
  return c.json({ status: "ok", service: "webhooks" });
});

export default app;
