/**
 * Daemon passthrough — auth happens here (session must own the handle).
 * Dev-server traffic bypasses this route (pods expose dev directly).
 * Runner is dispatched on the row's `runner_kind`, not current env.
 */

import { Hono } from "hono";
import type { Context } from "hono";
import type {
  RunnerKind,
  SandboxRunner,
} from "mesh-plugin-user-sandbox/runner";
import type { MeshContext } from "@/core/mesh-context";
import { getRunnerByKind } from "@/sandbox/lifecycle";

const SUPPORTED_KINDS: ReadonlySet<RunnerKind> = new Set([
  "docker",
  "freestyle",
]);

async function authorizeSandbox(
  c: Context<{ Variables: { meshContext: MeshContext } }>,
): Promise<{ handle: string; runner: SandboxRunner } | Response> {
  const ctx = c.get("meshContext");
  const userId = ctx.auth?.user?.id;
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const handle = c.req.param("handle");
  if (!handle) return c.json({ error: "Invalid sandbox handle" }, 400);

  const row = await ctx.db
    .selectFrom("sandbox_runner_state")
    .select(["user_id", "runner_kind"])
    .where("handle", "=", handle)
    .executeTakeFirst();
  if (!row || row.user_id !== userId) {
    return c.json({ error: "Sandbox not found" }, 404);
  }
  const kind = row.runner_kind as RunnerKind;
  if (!SUPPORTED_KINDS.has(kind)) {
    return c.json(
      { error: `Daemon passthrough unsupported for runner ${row.runner_kind}` },
      400,
    );
  }
  return { handle, runner: await getRunnerByKind(ctx, kind) };
}

export function createSandboxDaemonRoutes() {
  const app = new Hono<{ Variables: { meshContext: MeshContext } }>();

  const forward = async (
    c: Context<{ Variables: { meshContext: MeshContext } }>,
  ) => {
    const auth = await authorizeSandbox(c);
    if (auth instanceof Response) return auth;

    const prefix = `/api/sandbox/${auth.handle}`;
    const url = new URL(c.req.url);
    const tail = url.pathname.startsWith(prefix)
      ? url.pathname.slice(prefix.length)
      : "";
    // tail already starts with `/_daemon/...`, so passthrough as-is.
    const upstream = await auth.runner.proxyDaemonRequest(
      auth.handle,
      `${tail}${url.search}`,
      {
        method: c.req.method,
        headers: c.req.raw.headers,
        body: c.req.raw.body,
        signal: c.req.raw.signal,
      },
    );
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: upstream.headers,
    });
  };

  app.all("/api/sandbox/:handle/_daemon/*", forward);
  app.all("/api/sandbox/:handle/_daemon", forward);

  return app;
}
