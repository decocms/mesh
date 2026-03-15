/**
 * File Serving Route
 *
 * Serves files stored in object storage via authenticated HTTP requests.
 * Used by the chat UI to display generated images stored in object storage
 * instead of embedding large base64 data URLs in messages.
 *
 * Route: GET /api/files/:key{.+}
 * Requires: authenticated user with organization scope
 */

import { Hono } from "hono";
import type { MeshContext } from "@/core/mesh-context";
import type { GetObjectTooLargeResult } from "@/object-storage/s3-service";

type Env = { Variables: { meshContext: MeshContext } };

function isTooLarge(result: unknown): result is GetObjectTooLargeResult {
  return (
    typeof result === "object" &&
    result !== null &&
    "error" in result &&
    (result as GetObjectTooLargeResult).error === "FILE_TOO_LARGE"
  );
}

const app = new Hono<Env>();

app.get("/:key{.+}", async (c) => {
  const ctx = c.get("meshContext");
  const objectStorage = ctx.objectStorage;

  if (!objectStorage) {
    return c.json({ error: "Object storage not configured" }, 503);
  }

  const key = c.req.param("key");
  if (!key) {
    return c.json({ error: "Missing file key" }, 400);
  }

  try {
    const result = await objectStorage.get(key);

    if (isTooLarge(result)) {
      return c.redirect(result.presignedUrl, 302);
    }

    const body =
      result.encoding === "base64"
        ? Buffer.from(result.content, "base64")
        : result.content;

    return new Response(body, {
      headers: {
        "Content-Type": result.contentType,
        "Cache-Control": "private, max-age=86400, immutable",
        ...(result.etag ? { ETag: result.etag } : {}),
      },
    });
  } catch (err) {
    if (
      err instanceof Error &&
      (err.name === "NoSuchKey" || err.message.includes("NoSuchKey"))
    ) {
      return c.json({ error: "File not found" }, 404);
    }
    console.error("[files] Error serving file:", err);
    return c.json({ error: "Failed to read file" }, 500);
  }
});

export default app;
