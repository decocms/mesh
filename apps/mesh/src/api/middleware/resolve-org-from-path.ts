import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { MeshContext } from "../../core/mesh-context";

export const resolveOrgFromPath: MiddlewareHandler<{
  Variables: { meshContext: MeshContext };
}> = async (c, next) => {
  const slug = c.req.param("org");
  if (!slug) {
    throw new HTTPException(400, { message: "org slug missing in path" });
  }

  const ctx = c.get("meshContext");
  if (!ctx?.db) {
    throw new HTTPException(500, { message: "meshContext not initialized" });
  }
  const db = ctx.db;

  const org = await db
    .selectFrom("organization")
    .select(["id", "slug", "name"])
    .where("slug", "=", slug)
    .executeTakeFirst();

  if (!org) {
    throw new HTTPException(404, {
      message: `organization "${slug}" not found`,
    });
  }

  const userId = ctx.auth?.user?.id;
  if (!userId) {
    throw new HTTPException(403, {
      message: "forbidden: not a member of organization",
    });
  }

  const membership = await db
    .selectFrom("member")
    .select(["role"])
    .where("userId", "=", userId)
    .where("organizationId", "=", org.id)
    .executeTakeFirst();

  if (!membership) {
    throw new HTTPException(403, {
      message: "forbidden: not a member of organization",
    });
  }

  ctx.organization = { id: org.id, slug: org.slug, name: org.name };

  await next();
};
