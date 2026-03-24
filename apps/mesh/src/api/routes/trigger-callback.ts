/**
 * Trigger Callback Endpoint
 *
 * Receives trigger events from external MCPs (e.g., GitHub webhook handler)
 * and fires matching automations via EventTriggerEngine.
 *
 * Auth: Bearer token (callback token generated during TRIGGER_CONFIGURE)
 * Route: POST /api/trigger-callback
 */

import { Hono } from "hono";
import type { EventTriggerEngine } from "@/automations/event-trigger-engine";
import type { TriggerCallbackTokenStorage } from "@/storage/trigger-callback-tokens";

interface TriggerCallbackDeps {
  tokenStorage: TriggerCallbackTokenStorage;
  eventTriggerEngine: EventTriggerEngine;
}

const MAX_BODY_SIZE = 1_048_576; // 1MB

export function createTriggerCallbackRoutes(deps: TriggerCallbackDeps) {
  const app = new Hono();

  app.post("/trigger-callback", async (c) => {
    // Extract Bearer token
    const authHeader = c.req.header("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return c.json({ error: "Missing or invalid Authorization header" }, 401);
    }
    const token = authHeader.slice(7);

    // Validate token
    const context = await deps.tokenStorage.validateToken(token);
    if (!context) {
      return c.json({ error: "Invalid callback token" }, 401);
    }

    // Parse body
    const contentLength = parseInt(c.req.header("content-length") ?? "0", 10);
    if (contentLength > MAX_BODY_SIZE) {
      return c.json({ error: "Payload too large" }, 413);
    }

    let body: { type?: string; data?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    if (!body.type || typeof body.type !== "string") {
      return c.json({ error: "Missing required field: type" }, 400);
    }

    // Fire matching automations (fire-and-forget)
    deps.eventTriggerEngine.notifyEvents([
      {
        source: context.connectionId,
        type: body.type,
        data: body.data ?? {},
        organizationId: context.organizationId,
      },
    ]);

    return c.json({ ok: true, type: body.type }, 202);
  });

  return app;
}
