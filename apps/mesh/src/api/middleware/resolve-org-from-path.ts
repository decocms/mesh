import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";

export const resolveOrgFromPath: MiddlewareHandler = async (c, next) => {
  const slug = c.req.param("org");
  if (!slug) {
    throw new HTTPException(400, { message: "org slug missing in path" });
  }

  // biome-ignore lint/suspicious/noExplicitAny: meshContext shape is dynamic across handlers
  const ctx: any = c.get("meshContext");
  if (!ctx?.storage?.db) {
    throw new HTTPException(500, { message: "meshContext not initialized" });
  }
  const db = ctx.storage.db;

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
  const apiKeyOrgId = ctx.auth?.apiKey?.organizationId;

  let isMember = false;
  if (apiKeyOrgId === org.id) {
    isMember = true;
  } else if (userId) {
    const membership = await db
      .selectFrom("member")
      .select(["role"])
      .where("userId", "=", userId)
      .where("organizationId", "=", org.id)
      .executeTakeFirst();
    isMember = !!membership;
  }

  if (!isMember) {
    throw new HTTPException(403, {
      message: "forbidden: not a member of organization",
    });
  }

  ctx.organization = { id: org.id, slug: org.slug, name: org.name };
  c.set("meshContext", ctx);

  await next();
};
