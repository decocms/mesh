import type { MiddlewareHandler } from "hono";
import type { MeshContext } from "../../core/mesh-context";

export const resolveOrgFromPath: MiddlewareHandler<{
  Variables: { meshContext: MeshContext };
}> = async (c, next) => {
  const slug = c.req.param("org");
  if (!slug) {
    return c.json({ error: "org slug missing in path" }, 400);
  }

  const ctx = c.get("meshContext");
  if (!ctx?.db) {
    return c.json({ error: "meshContext not initialized" }, 500);
  }
  const db = ctx.db;

  const org = await db
    .selectFrom("organization")
    .select(["id", "slug", "name"])
    .where("slug", "=", slug)
    .executeTakeFirst();

  if (!org) {
    return c.json({ error: `organization "${slug}" not found` }, 404);
  }

  const userId = ctx.auth?.user?.id;
  if (!userId) {
    return c.json({ error: "forbidden: not a member of organization" }, 403);
  }

  const membership = await db
    .selectFrom("member")
    .select(["role"])
    .where("userId", "=", userId)
    .where("organizationId", "=", org.id)
    .executeTakeFirst();

  if (!membership) {
    return c.json({ error: "forbidden: not a member of organization" }, 403);
  }

  ctx.organization = { id: org.id, slug: org.slug, name: org.name };
  // Tell AccessControl to use the path-resolved org for permission checks.
  // Without this, boundAuth.hasPermission falls back to the session's
  // activeOrganizationId — which races with signup in CI and can be stale or
  // pointing at a different org than the URL.
  ctx.access.setOrganizationId(org.id);

  return await next();
};
