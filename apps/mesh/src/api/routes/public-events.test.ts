import { describe, it, expect, mock } from "bun:test";
import { Hono } from "hono";
import type { MeshContext } from "../../core/mesh-context";
import { WellKnownOrgMCPId } from "@decocms/mesh-sdk";

/**
 * Tests for POST /org/:organizationId/events/:type
 *
 * The handler is inline in app.ts, so we replicate it here to verify the
 * auth + org-ownership guards in isolation.
 */

type Env = { Variables: { meshContext: MeshContext } };

function createApp(ctx: unknown) {
  const app = new Hono<Env>();
  app.use("*", async (c, next) => {
    c.set("meshContext", ctx as MeshContext);
    await next();
  });
  app.post("/org/:organizationId/events/:type", async (c) => {
    const meshContext = c.var.meshContext;

    const userId = meshContext.auth.user?.id ?? meshContext.auth.apiKey?.userId;
    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const orgId = c.req.param("organizationId");

    if (orgId !== meshContext.organization?.id) {
      return c.json({ error: "Forbidden access to organization" }, 403);
    }

    await meshContext.eventBus.publish(orgId, WellKnownOrgMCPId.SELF(orgId), {
      data: await c.req.json(),
      type: `public:${c.req.param("type")}`,
      subject: c.req.query("subject"),
      deliverAt: c.req.query("deliverAt"),
      cron: c.req.query("cron"),
    });
    return c.json({ success: true });
  });
  return app;
}

function postEvent(
  app: Hono<Env>,
  orgId: string,
  type: string,
  body: unknown,
  query?: string,
) {
  const qs = query ? `?${query}` : "";
  return app.request(`/org/${orgId}/events/${type}${qs}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /org/:organizationId/events/:type", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const app = createApp({
      auth: { user: undefined, apiKey: undefined },
      organization: undefined,
      eventBus: { publish: mock() },
    });

    const res = await postEvent(app, "org_victim", "data", {
      payload: "attack",
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Unauthorized");
  });

  it("rejects cross-tenant access with 403", async () => {
    const publishMock = mock();
    const app = createApp({
      auth: { user: { id: "user_1" } },
      organization: { id: "org_attacker" },
      eventBus: { publish: publishMock },
    });

    const res = await postEvent(app, "org_victim", "data", {
      payload: "attack",
    });

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Forbidden access to organization");
    expect(publishMock).not.toHaveBeenCalled();
  });

  it("rejects org-less API key with 403", async () => {
    const publishMock = mock();
    const app = createApp({
      auth: { user: undefined, apiKey: { userId: "user_1" } },
      organization: undefined,
      eventBus: { publish: publishMock },
    });

    const res = await postEvent(app, "org_victim", "data", {
      payload: "attack",
    });

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Forbidden access to organization");
    expect(publishMock).not.toHaveBeenCalled();
  });

  it("rejects cron injection from different org with 403", async () => {
    const publishMock = mock();
    const app = createApp({
      auth: { user: { id: "user_1" } },
      organization: { id: "org_attacker" },
      eventBus: { publish: publishMock },
    });

    const res = await postEvent(
      app,
      "org_victim",
      "trigger",
      { recurring: true },
      "cron=*/5+*+*+*+*",
    );

    expect(res.status).toBe(403);
    expect(publishMock).not.toHaveBeenCalled();
  });

  it("allows authenticated user to publish to own org", async () => {
    const publishMock = mock();
    const app = createApp({
      auth: { user: { id: "user_1" } },
      organization: { id: "org_1" },
      eventBus: { publish: publishMock },
    });

    const res = await postEvent(app, "org_1", "data", {
      payload: "legitimate",
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);
    expect(publishMock).toHaveBeenCalledTimes(1);
  });
});
