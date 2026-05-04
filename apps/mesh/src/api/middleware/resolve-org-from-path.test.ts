import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Hono } from "hono";
import type { MeshContext } from "../../core/mesh-context";
import {
  closeTestDatabase,
  createTestDatabase,
  type TestDatabase,
} from "../../database/test-db";
import { createTestSchema } from "../../storage/test-helpers";
import { resolveOrgFromPath } from "./resolve-org-from-path";

type Variables = { meshContext: MeshContext };

describe("resolveOrgFromPath", () => {
  let db: TestDatabase;
  let app: Hono<{ Variables: Variables }>;

  beforeEach(async () => {
    db = await createTestDatabase();
    await createTestSchema(db.db);

    // Seed an org "acme" with id "org-1" and a member "user-1".
    await db.db
      .insertInto("organization")
      .values({
        id: "org-1",
        slug: "acme",
        name: "Acme",
        createdAt: new Date().toISOString(),
      })
      .execute();
    await db.db
      .insertInto("user")
      .values({
        id: "user-1",
        email: "u@acme.test",
        name: "U",
        emailVerified: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .execute();
    await db.db
      .insertInto("member")
      .values({
        id: "mem-1",
        userId: "user-1",
        organizationId: "org-1",
        role: "member",
        createdAt: new Date().toISOString(),
      })
      .execute();

    app = new Hono<{ Variables: Variables }>();
    // Inject a fake meshContext that is "user-1" so the middleware sees them.
    app.use("*", async (c, next) => {
      c.set("meshContext", {
        auth: { user: { id: "user-1" } },
        storage: { db: db.db },
      } as unknown as MeshContext);
      await next();
    });
    app.use("/api/:org/*", resolveOrgFromPath);
    app.get("/api/:org/probe", (c) => {
      const ctx = c.get("meshContext");
      return c.json({
        orgId: ctx.organization?.id,
        orgSlug: ctx.organization?.slug,
      });
    });
  });

  afterEach(async () => {
    await closeTestDatabase(db);
  });

  it("returns 404 when slug does not exist", async () => {
    const res = await app.request("/api/nope/probe");
    expect(res.status).toBe(404);
  });

  it("returns 403 when user is not a member", async () => {
    await db.db
      .insertInto("organization")
      .values({
        id: "org-2",
        slug: "other",
        name: "Other",
        createdAt: new Date().toISOString(),
      })
      .execute();
    const res = await app.request("/api/other/probe");
    expect(res.status).toBe(403);
  });

  it("sets ctx.organization on success", async () => {
    const res = await app.request("/api/acme/probe");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.orgId).toBe("org-1");
    expect(body.orgSlug).toBe("acme");
  });
});
