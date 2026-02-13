import { Hono } from "hono";
import type { ServerPluginContext } from "@decocms/bindings/server-plugin";
import type { Kysely } from "kysely";
import { z } from "zod";
import { PLUGIN_ID } from "../../shared";
import { PublishRequestStorage } from "../storage/publish-request";
import { PublishApiKeyStorage } from "../storage/publish-api-key";
import { PublicPublishRequestInputSchema } from "../tools/schema";
import type { PrivateRegistryDatabase } from "../storage/types";

/** Rate limit: max requests per org per hour */
const RATE_LIMIT_PER_HOUR = 30;

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

interface PluginSettings {
  acceptPublishRequests?: boolean;
  requireApiToken?: boolean;
}

async function getPluginSettings(
  db: CoreDb,
  orgId: string,
): Promise<PluginSettings> {
  const rows = await db
    .selectFrom("project_plugin_configs")
    .innerJoin("projects", "projects.id", "project_plugin_configs.project_id")
    .select(["project_plugin_configs.settings as settings"])
    .where("projects.organization_id", "=", orgId)
    .where("project_plugin_configs.plugin_id", "=", PLUGIN_ID)
    .execute();

  for (const row of rows as Array<{ settings: string | null }>) {
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

    if (settings.acceptPublishRequests === true) {
      return {
        acceptPublishRequests: true,
        requireApiToken: settings.requireApiToken === true,
      };
    }
  }

  return { acceptPublishRequests: false };
}

/**
 * Check how many publish requests were created for this org in the last hour.
 */
async function countRecentRequests(
  db: Kysely<PrivateRegistryDatabase>,
  orgId: string,
): Promise<number> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const row = await db
    .selectFrom("private_registry_publish_request")
    .select((eb) => eb.fn.countAll<string>().as("count"))
    .where("organization_id", "=", orgId)
    .where("created_at", ">=", oneHourAgo)
    .executeTakeFirst();

  return Number(row?.count ?? 0);
}

/**
 * Prevent publish requests from colliding with an existing registry item.
 * We block when either the requested ID or title is already in use.
 */
async function findRegistryItemConflict(
  db: Kysely<PrivateRegistryDatabase>,
  orgId: string,
  requestedId: string,
  requestedTitle: string,
): Promise<{ id: string; title: string } | null> {
  const conflict = await db
    .selectFrom("private_registry_item")
    .select(["id", "title"])
    .where("organization_id", "=", orgId)
    .where((eb) =>
      eb.or([eb("id", "=", requestedId), eb("title", "=", requestedTitle)]),
    )
    .executeTakeFirst();

  return conflict
    ? { id: String(conflict.id), title: String(conflict.title) }
    : null;
}

export function publicPublishRequestRoutes(
  app: Hono,
  ctx: ServerPluginContext,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = ctx.db as any;
  const typedDb = ctx.db as Kysely<PrivateRegistryDatabase>;
  const storage = new PublishRequestStorage(typedDb);
  const apiKeyStorage = new PublishApiKeyStorage(typedDb);

  app.post("/org/:orgRef/registry/publish-request", async (c) => {
    const orgRef = c.req.param("orgRef");
    const organizationId = await resolveOrganizationId(db as CoreDb, orgRef);
    if (!organizationId) {
      return c.json({ error: "Organization not found" }, 404);
    }

    // ── Check plugin settings ──
    const settings = await getPluginSettings(db as CoreDb, organizationId);

    if (!settings.acceptPublishRequests) {
      return c.json(
        { error: "Publish requests are not enabled for this registry." },
        403,
      );
    }

    // ── API key validation ──
    if (settings.requireApiToken) {
      const authHeader = c.req.header("Authorization");
      const token = authHeader?.startsWith("Bearer ")
        ? authHeader.slice(7).trim()
        : null;

      if (!token) {
        return c.json(
          { error: "API key required. Use Authorization: Bearer <key>" },
          401,
        );
      }

      const valid = await apiKeyStorage.validate(organizationId, token);
      if (!valid) {
        return c.json({ error: "Invalid API key" }, 401);
      }
    }

    // ── Rate limit ──
    const recentCount = await countRecentRequests(typedDb, organizationId);
    if (recentCount >= RATE_LIMIT_PER_HOUR) {
      return c.json(
        {
          error: "Too many publish requests. Please try again later.",
          retryAfterSeconds: 3600,
        },
        429,
      );
    }

    // ── Parse and create ──
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

    // ── Existing item collision guard ──
    const conflict = await findRegistryItemConflict(
      typedDb,
      organizationId,
      parsed.data.data.id,
      parsed.data.data.title,
    );
    if (conflict) {
      return c.json(
        {
          error:
            "A registry item with the same id or title already exists. Please use a different name/id.",
          conflict,
        },
        409,
      );
    }

    const created = await storage.createOrUpdate({
      organization_id: organizationId,
      requested_id: parsed.data.data.id,
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
        requested_id: created.requested_id,
        status: created.status,
      },
      201,
    );
  });
}
