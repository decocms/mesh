/**
 * Sandbox User-Data Routes
 *
 * File access for code running inside a mesh-managed sandbox.
 * Authenticated by the per-sandbox `DAEMON_TOKEN` (the same secret mesh
 * uses to talk to the daemon, presented in reverse direction here). The
 * bearer middleware looks the token up in `sandbox_runner_state` and
 * pulls the owning org from the row's persisted `tenant.orgId`, so the
 * sandbox cannot name another org's keys — `BoundObjectStorage` auto
 * prefixes with the looked-up orgId.
 *
 * Routes (mounted under `/api/sandbox/user-data`):
 *   GET /list?prefix=&continuationToken=&maxKeys=
 *     Lists object keys in the org's bucket. No prefix restriction —
 *     auto-org-prefix is the security boundary; all six existing
 *     prefixes (chat-uploads/, screenshots/, generated-images/,
 *     inspect-pages/, scraped-pages/, web-search/) are model-relevant.
 *   GET /get?key=<key>
 *     302 redirect to a fresh presigned GET URL. Single code path; no
 *     inline-bytes branch.
 *   POST /share  (X-Filename header, raw body)
 *     Uploads bytes from the sandbox to model-outputs/<thread_id>/<filename>.
 *     Resolves thread_id from the sandbox row's project_ref
 *     (`thread:<id>` shape). Rejects non-thread sandboxes (agent
 *     sandboxes have no chat to surface artifacts in). 100 MB cap.
 *
 * The `shouldSkipMeshContext` allowlist must include this prefix so the
 * user-session middleware doesn't reject requests for lacking a session.
 */

import { Hono } from "hono";
import { sql, type Kysely } from "kysely";
import type { Database } from "@/storage/types";
import { getObjectStorageS3Service } from "@/object-storage/factory";
import { createBoundObjectStorage } from "@/object-storage/bound-object-storage";

interface SandboxIdentity {
  orgId: string;
  sandboxHandle: string;
  /** Set when project_ref has the `thread:<id>` shape; null for agent sandboxes. */
  threadId: string | null;
}

type Variables = {
  sandboxIdentity: SandboxIdentity;
};

interface SandboxUserDataDeps {
  db: Kysely<Database>;
}

const MAX_KEYS_CAP = 200;
const MAX_SHARE_BYTES = 100 * 1024 * 1024;
const THREAD_REF_PREFIX = "thread:";

function parseThreadId(projectRef: string): string | null {
  return projectRef.startsWith(THREAD_REF_PREFIX)
    ? projectRef.slice(THREAD_REF_PREFIX.length)
    : null;
}

/** Reject path-traversal, leading slash, and slashes in the filename itself. */
function sanitizeFilename(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.includes("/") || trimmed.includes("\\")) return null;
  if (trimmed === "." || trimmed === ".." || trimmed.includes(".."))
    return null;
  if (trimmed.length > 255) return null;
  return trimmed;
}

export function createSandboxUserDataRoutes(deps: SandboxUserDataDeps) {
  const app = new Hono<{ Variables: Variables }>();

  // Bearer middleware: resolve DAEMON_TOKEN → orgId via sandbox_runner_state.
  // No fallback to user-session auth — this prefix is for sandbox callbacks.
  app.use("*", async (c, next) => {
    const auth = c.req.header("Authorization") ?? "";
    const match = auth.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return c.json({ error: "Missing bearer token" }, 401);
    }
    const token = match[1]!;

    const row = await deps.db
      .selectFrom("sandbox_runner_state")
      .select(["handle", "state", "project_ref"])
      .where(sql<string>`state ->> 'token'`, "=", token)
      .executeTakeFirst()
      .catch(() => undefined);

    if (!row) {
      return c.json({ error: "Invalid sandbox token" }, 401);
    }

    const state = row.state as Record<string, unknown> | null;
    const tenant = state?.tenant as { orgId?: string } | undefined;
    if (!tenant?.orgId) {
      // Pre-tenant-persistence rows (sandboxes provisioned before this
      // change shipped) can't be resolved. Caller falls through to a
      // 401; user reprovisions on next ensure() and gets a fresh token.
      return c.json({ error: "Sandbox missing tenant info" }, 401);
    }

    c.set("sandboxIdentity", {
      orgId: tenant.orgId,
      sandboxHandle: row.handle as string,
      threadId: parseThreadId(row.project_ref as string),
    });
    return next();
  });

  app.get("/list", async (c) => {
    const { orgId } = c.get("sandboxIdentity");
    const s3 = getObjectStorageS3Service();
    if (!s3) {
      return c.json({ error: "Object storage not configured" }, 503);
    }
    const storage = createBoundObjectStorage(s3, orgId);

    const rawPrefix = c.req.query("prefix") ?? "";
    if (rawPrefix.includes("..") || rawPrefix.startsWith("/")) {
      return c.json({ error: "Invalid prefix" }, 400);
    }
    const continuationToken = c.req.query("continuationToken");
    const maxKeysParam = Number.parseInt(c.req.query("maxKeys") ?? "", 10);
    const maxKeys = Number.isFinite(maxKeysParam)
      ? Math.min(Math.max(maxKeysParam, 1), MAX_KEYS_CAP)
      : 100;

    const result = await storage.list({
      prefix: rawPrefix || undefined,
      maxKeys,
      continuationToken,
    });

    return c.json({
      objects: result.objects.map((o) => ({
        key: o.key,
        size: o.size,
        uploadedAt: o.lastModified?.toISOString(),
      })),
      isTruncated: result.isTruncated,
      ...(result.nextContinuationToken
        ? { nextContinuationToken: result.nextContinuationToken }
        : {}),
    });
  });

  app.get("/get", async (c) => {
    const { orgId } = c.get("sandboxIdentity");
    const s3 = getObjectStorageS3Service();
    if (!s3) {
      return c.json({ error: "Object storage not configured" }, 503);
    }
    const storage = createBoundObjectStorage(s3, orgId);

    const key = c.req.query("key");
    if (!key) {
      return c.json({ error: "Missing key" }, 400);
    }
    if (key.includes("..") || key.startsWith("/")) {
      return c.json({ error: "Invalid key" }, 400);
    }

    const presignedUrl = await storage.presignedGetUrl(key).catch(() => null);
    if (!presignedUrl) {
      return c.json({ error: "Not found" }, 404);
    }

    return c.redirect(presignedUrl, 302);
  });

  app.post("/share", async (c) => {
    const { orgId, threadId } = c.get("sandboxIdentity");
    if (!threadId) {
      return c.json(
        { error: "Sharing only works in chat-thread sandboxes" },
        400,
      );
    }
    const s3 = getObjectStorageS3Service();
    if (!s3) {
      return c.json({ error: "Object storage not configured" }, 503);
    }

    const filenameHeader = c.req.header("X-Filename");
    if (!filenameHeader) {
      return c.json({ error: "Missing X-Filename header" }, 400);
    }
    const filename = sanitizeFilename(filenameHeader);
    if (!filename) {
      return c.json({ error: "Invalid X-Filename" }, 400);
    }

    // ArrayBuffer reads the full body — Hono enforces no streaming bound
    // here, so cap explicitly. Content-Length is advisory; trust the
    // actual byte count.
    const body = new Uint8Array(await c.req.arrayBuffer());
    if (body.byteLength > MAX_SHARE_BYTES) {
      return c.json({ error: "Payload too large (>100 MB)" }, 413);
    }
    if (body.byteLength === 0) {
      return c.json({ error: "Empty body" }, 400);
    }

    const contentType =
      c.req.header("Content-Type") ?? "application/octet-stream";
    const key = `model-outputs/${threadId}/${filename}`;

    const storage = createBoundObjectStorage(s3, orgId);
    await storage.put(key, body, { contentType });

    const origin = new URL(c.req.url).origin;
    return c.json({
      key,
      downloadUrl: `${origin}/api/${orgId}/files/${key}`,
    });
  });

  return app;
}
