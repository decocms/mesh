/**
 * Files Route
 *
 * Serves org-scoped storage files via a stable, non-expiring URL.
 * Redirects to a fresh presigned GET URL on every request, so the
 * caller never needs to manage URL expiry.
 *
 * Route: GET /api/:org/files/:key
 *
 * This endpoint is the stable public URL stored in chat history as
 * the text annotation for uploaded files. Clients (UI <img> tags,
 * MCP tools) can use it instead of presigned URLs and it always works.
 */

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { MeshContext } from "@/core/mesh-context";
import { generatePresignedGetUrl } from "./decopilot/file-materializer";

type Variables = { meshContext: MeshContext };

const app = new Hono<{ Variables: Variables }>();

app.get("/:org/files/*", async (c) => {
  const ctx = c.get("meshContext");
  const orgId = ctx.organization?.id;

  if (!orgId) {
    throw new HTTPException(401, { message: "Organization context required" });
  }

  // Extract the file key from the wildcard segment
  const key = c.req.path.replace(/^\/[^/]+\/files\//, "");

  if (!key) {
    throw new HTTPException(400, { message: "Missing file key" });
  }

  const presignedUrl = await generatePresignedGetUrl(key, ctx);

  if (!presignedUrl) {
    throw new HTTPException(503, { message: "Object storage not configured" });
  }

  return c.redirect(presignedUrl, 302);
});

export default app;
