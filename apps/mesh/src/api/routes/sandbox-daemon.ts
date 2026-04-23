/**
 * Sandbox daemon passthrough.
 *
 * `/api/sandbox/:handle/_daemon/*` → the sandbox's daemon on `/_daemon/*`
 * with the server-to-server bearer token attached. Authorization happens
 * here: the caller's session must own the handle (checked against
 * `sandbox_runner_state`). Dev-server traffic does NOT flow through this
 * route — it goes directly to the pod via its public URL.
 */

import { Hono } from "hono";
import type { Context } from "hono";
import { DockerSandboxRunner } from "mesh-plugin-user-sandbox/runner";
import type { MeshContext } from "@/core/mesh-context";
import { getSharedRunner } from "@/sandbox/lifecycle";

const SANDBOX_RUNNER_KIND = "docker";

async function authorizeSandbox(
  c: Context<{ Variables: { meshContext: MeshContext } }>,
): Promise<{ handle: string; runner: DockerSandboxRunner } | Response> {
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
  if (row.runner_kind !== SANDBOX_RUNNER_KIND) {
    return c.json(
      { error: `Daemon passthrough unsupported for runner ${row.runner_kind}` },
      400,
    );
  }

  const runner = getSharedRunner(ctx);
  if (!(runner instanceof DockerSandboxRunner)) {
    return c.json({ error: "Runner not configured for docker daemon" }, 500);
  }
  return { handle, runner };
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
