/**
 * Thread Outputs Route
 *
 * Lists files the model has shared back to the user via the
 * `share_with_user` tool. Files live under `model-outputs/<thread_id>/`
 * and the chat UI polls this endpoint on assistant-turn completion to
 * render download chips on the producing turn.
 *
 * Route: GET /api/threads/:threadId/outputs
 *
 * Auth: standard `meshContext` user-session middleware. The thread
 * lookup uses `OrgScopedThreadStorage` so an authenticated user can
 * only see threads belonging to their org.
 */

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { MeshContext } from "@/core/mesh-context";

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

  const storage = ctx.objectStorage;
  if (!storage) {
    return c.json({ objects: [] });
  }
  const result = await storage.list({
    prefix: `model-outputs/${threadId}/`,
    maxKeys: 200,
  });

  const origin = new URL(c.req.url).origin;
  return c.json({
    objects: result.objects.map((o) => {
      const filename = o.key.split("/").pop() ?? o.key;
      // Encode each path segment — keys may carry URL-special chars
      // (?, #, &, space) and `c.req.path` in the files route truncates
      // at the first unescaped `?`.
      const encodedKey = o.key.split("/").map(encodeURIComponent).join("/");
      return {
        key: o.key,
        filename,
        size: o.size,
        uploadedAt: o.lastModified?.toISOString(),
        downloadUrl: `${origin}/api/${encodeURIComponent(orgId)}/files/${encodedKey}`,
      };
    }),
  });
});

export default app;
