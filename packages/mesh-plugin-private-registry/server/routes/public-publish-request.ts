import { Hono } from "hono";
import type { ServerPluginContext } from "@decocms/bindings/server-plugin";
import { z } from "zod";
import { PLUGIN_ID } from "../../shared";
import { PublishRequestStorage } from "../storage/publish-request";
import { PublicPublishRequestInputSchema } from "../tools/schema";

type CoreDb = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  selectFrom: (...args: any[]) => any;
};

async function resolveOrganizationId(
  db: CoreDb,
  orgRef: string,
): Promise<string | null> {
  const byIdRows = await db
    .selectFrom("organization")
    .select(["id"])
    .where("id", "=", orgRef)
    .execute();
  const byId = byIdRows[0] as { id: string } | undefined;
  if (byId?.id) return byId.id;

  const bySlugRows = await db
    .selectFrom("organization")
    .select(["id"])
    .where("slug", "=", orgRef)
    .execute();
  const bySlug = bySlugRows[0] as { id: string } | undefined;
  return bySlug?.id ?? null;
}

async function acceptsPublishRequests(
  db: CoreDb,
  orgId: string,
): Promise<boolean> {
  const rows = await db
    .selectFrom("project_plugin_configs")
    .innerJoin("projects", "projects.id", "project_plugin_configs.project_id")
    .select(["project_plugin_configs.settings as settings"])
    .where("projects.organization_id", "=", orgId)
    .where("project_plugin_configs.plugin_id", "=", PLUGIN_ID)
    .execute();

  return rows.some((row: { settings: string | null }) => {
    const rawSettings = row.settings;
    const settings =
      typeof rawSettings === "string"
        ? (() => {
            try {
              return JSON.parse(rawSettings) as Record<string, unknown>;
            } catch {
              return {};
            }
          })()
        : ((rawSettings as Record<string, unknown> | null) ?? {});
    return settings.acceptPublishRequests === true;
  });
}

export function publicPublishRequestRoutes(
  app: Hono,
  ctx: ServerPluginContext,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = ctx.db as any;
  const storage = new PublishRequestStorage(db);

  app.post("/org/:orgRef/registry/publish-request", async (c) => {
    const orgRef = c.req.param("orgRef");
    const organizationId = await resolveOrganizationId(db as CoreDb, orgRef);
    if (!organizationId) {
      return c.json({ error: "Organization not found" }, 404);
    }
    const enabled = await acceptsPublishRequests(db as CoreDb, organizationId);

    if (!enabled) {
      return c.json(
        { error: "Publish requests are not enabled for this registry." },
        403,
      );
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const parsed = PublicPublishRequestInputSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: "Invalid publish request payload",
          details: z.treeifyError(parsed.error),
        },
        400,
      );
    }

    const created = await storage.create({
      organization_id: organizationId,
      title: parsed.data.data.title,
      description: parsed.data.data.description ?? null,
      _meta: parsed.data.data._meta,
      server: parsed.data.data.server,
      requester_name: parsed.data.requester?.name ?? null,
      requester_email: parsed.data.requester?.email ?? null,
    });

    return c.json(
      {
        id: created.id,
        status: created.status,
      },
      201,
    );
  });
}
