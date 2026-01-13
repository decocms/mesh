import type { Kysely } from "kysely";
import type { Database, OrganizationSettings } from "./types";
import type { OrganizationSettingsStoragePort } from "./ports";

export class OrganizationSettingsStorage
  implements OrganizationSettingsStoragePort
{
  constructor(private readonly db: Kysely<Database>) {}

  async get(organizationId: string): Promise<OrganizationSettings | null> {
    const record = await this.db
      .selectFrom("organization_settings")
      .selectAll()
      .where("organizationId", "=", organizationId)
      .executeTakeFirst();

    if (!record) {
      return null;
    }

    return {
      organizationId: record.organizationId,
      sidebar_items: record.sidebar_items
        ? typeof record.sidebar_items === "string"
          ? JSON.parse(record.sidebar_items)
          : record.sidebar_items
        : null,
      enabled_plugins: record.enabled_plugins
        ? typeof record.enabled_plugins === "string"
          ? JSON.parse(record.enabled_plugins)
          : record.enabled_plugins
        : null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  async upsert(
    organizationId: string,
    data?: Partial<
      Pick<OrganizationSettings, "sidebar_items" | "enabled_plugins">
    >,
  ): Promise<OrganizationSettings> {
    const now = new Date().toISOString();
    const sidebarItemsJson = data?.sidebar_items
      ? JSON.stringify(data.sidebar_items)
      : null;
    const enabledPluginsJson = data?.enabled_plugins
      ? JSON.stringify(data.enabled_plugins)
      : null;

    await this.db
      .insertInto("organization_settings")
      .values({
        organizationId,
        sidebar_items: sidebarItemsJson,
        enabled_plugins: enabledPluginsJson,
        createdAt: now,
        updatedAt: now,
      })
      .onConflict((oc) =>
        oc.column("organizationId").doUpdateSet({
          sidebar_items: sidebarItemsJson ? sidebarItemsJson : undefined,
          enabled_plugins: enabledPluginsJson ? enabledPluginsJson : undefined,
          updatedAt: now,
        }),
      )
      .execute();

    const settings = await this.get(organizationId);
    if (!settings) {
      // Should not happen, but return synthesized value in case of race conditions
      return {
        organizationId,
        sidebar_items: data?.sidebar_items ?? null,
        enabled_plugins: data?.enabled_plugins ?? null,
        createdAt: now,
        updatedAt: now,
      };
    }

    return settings;
  }
}
