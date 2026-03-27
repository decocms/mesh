/**
 * KV API Routes
 *
 * Org-scoped key-value store accessible via API key auth.
 * Routes: GET/PUT/DELETE /api/kv/:key
 */

import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { MeshContext } from "@/core/mesh-context";
import type { KVStorage } from "@/storage/kv";

type Variables = {
  meshContext: MeshContext;
};

interface KVRouteDeps {
  kvStorage: KVStorage;
}

const MAX_VALUE_SIZE = 1_048_576; // 1MB

export function createKVRoutes(deps: KVRouteDeps) {
  const app = new Hono<{ Variables: Variables }>();

  app.get("/kv/:key", async (c) => {
    const meshContext = c.get("meshContext");
    const orgId = meshContext.organization?.id;
    if (!orgId) {
      return c.json({ error: "Organization required" }, 400);
    }

    const key = c.req.param("key");
    const value = await deps.kvStorage.get(orgId, key);

    if (value === null) {
      return c.json({ error: "Not found" }, 404);
    }

    return c.json({ key, value });
  });

  app.put(
    "/kv/:key",
    bodyLimit({
      maxSize: MAX_VALUE_SIZE,
      onError: (c) => c.json({ error: "Payload too large" }, 413),
    }),
    async (c) => {
      const meshContext = c.get("meshContext");
      const orgId = meshContext.organization?.id;
      if (!orgId) {
        return c.json({ error: "Organization required" }, 400);
      }

      const key = c.req.param("key");

      let body: Record<string, unknown>;
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: "Invalid JSON body" }, 400);
      }

      await deps.kvStorage.set(orgId, key, body);
      return c.json({ ok: true });
    },
  );

  app.delete("/kv/:key", async (c) => {
    const meshContext = c.get("meshContext");
    const orgId = meshContext.organization?.id;
    if (!orgId) {
      return c.json({ error: "Organization required" }, 400);
    }

    const key = c.req.param("key");
    await deps.kvStorage.delete(orgId, key);
    return c.json({ ok: true });
  });

  return app;
}
