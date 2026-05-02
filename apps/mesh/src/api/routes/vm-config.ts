/**
 * Browser-facing read of the daemon's live tenantConfig (slice 1).
 *
 * GET /api/vm-config?virtualMcpId=…&branch=… → mesh authenticates the user,
 * resolves the claim handle, then proxies GET /_decopilot_vm/config through
 * the runner (which injects the daemon bearer token).
 *
 * PUT lands in slice 2 — this file is the seam.
 */

import { Hono, type Context } from "hono";
import { composeSandboxRef, computeHandle } from "@decocms/sandbox/runner";
import { getOrInitSharedRunner } from "../../sandbox/lifecycle";
import {
  getUserId,
  requireAuth,
  requireOrganization,
} from "../../core/mesh-context";
import type { Env } from "../hono-env";

const app = new Hono<Env>();

async function resolveHandle(
  c: Context<Env>,
): Promise<
  { ok: true; claimName: string } | { ok: false; response: Response }
> {
  const ctx = c.var.meshContext;
  try {
    requireAuth(ctx);
  } catch {
    return { ok: false, response: c.json({ error: "Unauthorized" }, 401) };
  }
  const userId = getUserId(ctx);
  if (!userId) {
    return { ok: false, response: c.json({ error: "Unauthorized" }, 401) };
  }

  let organization: ReturnType<typeof requireOrganization>;
  try {
    organization = requireOrganization(ctx);
  } catch {
    return {
      ok: false,
      response: c.json({ error: "Organization scope required" }, 403),
    };
  }

  const virtualMcpId = c.req.query("virtualMcpId");
  const branch = c.req.query("branch");
  if (!virtualMcpId || !branch) {
    return {
      ok: false,
      response: c.json({ error: "virtualMcpId and branch are required" }, 400),
    };
  }

  const virtualMcp = await ctx.storage.virtualMcps.findById(virtualMcpId);
  if (!virtualMcp || virtualMcp.organization_id !== organization.id) {
    return {
      ok: false,
      response: c.json({ error: "Virtual MCP not found" }, 404),
    };
  }

  const projectRef = composeSandboxRef({
    orgId: organization.id,
    virtualMcpId,
    branch,
  });
  const claimName = computeHandle({ userId, projectRef }, branch);
  return { ok: true, claimName };
}

app.get("/", async (c) => {
  const resolved = await resolveHandle(c);
  if (!resolved.ok) return resolved.response;

  const runner = await getOrInitSharedRunner();
  if (!runner) return c.json({ error: "No sandbox runner configured" }, 503);

  let upstream: Response;
  try {
    upstream = await runner.proxyDaemonRequest(
      resolved.claimName,
      "/_decopilot_vm/config",
      { method: "GET", headers: new Headers(), body: null },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: `Daemon unreachable: ${message}` }, 502);
  }

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  });
});

app.put("/", async (c) => {
  const resolved = await resolveHandle(c);
  if (!resolved.ok) return resolved.response;

  let patch: unknown;
  try {
    patch = await c.req.json();
  } catch {
    return c.json({ error: "body must be JSON" }, 400);
  }
  if (!patch || typeof patch !== "object") {
    return c.json({ error: "body must be a JSON object" }, 400);
  }

  const runner = await getOrInitSharedRunner();
  if (!runner) return c.json({ error: "No sandbox runner configured" }, 503);

  // Daemon's PUT /config expects a base64-wrapped JSON body — same wire format
  // as everything under /_decopilot_vm/. Wrap once at this seam.
  const b64 = Buffer.from(JSON.stringify(patch), "utf-8").toString("base64");

  let upstream: Response;
  try {
    upstream = await runner.proxyDaemonRequest(
      resolved.claimName,
      "/_decopilot_vm/config",
      {
        method: "PUT",
        headers: new Headers({ "content-type": "application/json" }),
        body: b64,
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: `Daemon unreachable: ${message}` }, 502);
  }

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  });
});

export const vmConfigRoutes = app;
