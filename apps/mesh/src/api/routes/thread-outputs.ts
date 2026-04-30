/**
 * Thread Outputs Route
 *
 * Lists files the model has shared back to the user via
 * `user-data-share` (see packages/sandbox/image/skills/user-data/share.py).
 * Files land under `model-outputs/<thread_id>/<filename>`; the chat UI
 * polls this endpoint on assistant-turn completion to render download
 * chips on the producing turn.
 *
 * Route: GET /api/threads/:threadId/outputs
 *
 * Auth: standard `meshContext` user-session middleware. The thread
 * lookup uses `OrgScopedThreadStorage` so an authenticated user can
 * only see threads belonging to their org. Ownership is NOT enforced —
 * any org member who can see the thread can see its outputs (mirrors
 * the read-only access policy in `validateThreadAccess`).
 */

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { MeshContext } from "@/core/mesh-context";
import { createBoundObjectStorage } from "@/object-storage/bound-object-storage";
import { getObjectStorageS3Service } from "@/object-storage/factory";

type Variables = { meshContext: MeshContext };

const app = new Hono<{ Variables: Variables }>();

app.get("/threads/:threadId/outputs", async (c) => {
  const ctx = c.get("meshContext");
  const userId = ctx.auth?.user?.id;
  if (!userId) {
    throw new HTTPException(401, { message: "Unauthorized" });
  }
  const orgId = ctx.organization?.id;
  if (!orgId) {
    throw new HTTPException(400, { message: "Organization required" });
  }

  const threadId = c.req.param("threadId");
  if (!threadId || /[.*>\s]/.test(threadId)) {
    throw new HTTPException(400, { message: "Invalid thread ID" });
  }

  const thread = await ctx.storage.threads.get(threadId);
  if (!thread) {
    throw new HTTPException(404, { message: "Thread not found" });
  }

  const s3 = getObjectStorageS3Service();
  if (!s3) {
    return c.json({ objects: [] });
  }
  const storage = createBoundObjectStorage(s3, orgId);
  const result = await storage.list({
    prefix: `model-outputs/${threadId}/`,
    maxKeys: 200,
  });

  const origin = new URL(c.req.url).origin;
  return c.json({
    objects: result.objects.map((o) => {
      const filename = o.key.split("/").pop() ?? o.key;
      return {
        key: o.key,
        filename,
        size: o.size,
        uploadedAt: o.lastModified?.toISOString(),
        downloadUrl: `${origin}/api/${orgId}/files/${o.key}`,
      };
    }),
  });
});

export default app;
