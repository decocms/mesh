import { Hono } from "hono";
import type { ServerPluginContext } from "@decocms/bindings/server-plugin";
import type { Kysely } from "kysely";
import { RegistryItemStorage } from "../storage/registry-item";
import type { PrivateRegistryDatabase } from "../storage/types";

export function publicRegistryRoutes(
  app: Hono,
  ctx: ServerPluginContext,
): void {
  const storage = new RegistryItemStorage(
    ctx.db as Kysely<PrivateRegistryDatabase>,
  );

  app.get("/org/:orgId/registry/public", async (c) => {
    const organizationId = c.req.param("orgId");
    const limitValue = c.req.query("limit");
    const offsetValue = c.req.query("offset");
    const cursor = c.req.query("cursor");
    const tags = c.req.query("tags")?.split(",").filter(Boolean);
    const categories = c.req.query("categories")?.split(",").filter(Boolean);

    const limit = limitValue ? Number.parseInt(limitValue, 10) : undefined;
    const offset = offsetValue ? Number.parseInt(offsetValue, 10) : undefined;

    const result = await storage.listPublic(organizationId, {
      limit: Number.isNaN(limit) ? undefined : limit,
      offset: Number.isNaN(offset) ? undefined : offset,
      cursor,
      tags,
      categories,
    });

    return c.json(result);
  });
}
