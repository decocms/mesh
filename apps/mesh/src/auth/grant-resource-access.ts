/**
 * Auto-grant new resources (connections, virtual MCPs) to all existing
 * custom roles in an organization.
 *
 * Default-allow semantic: when an admin adds a new MCP, every member —
 * regardless of their custom role — should be able to use it. To restrict
 * access, an admin explicitly removes the grant from the role afterward.
 *
 * Owner / admin roles bypass all permission checks at runtime, so they
 * don't need updates here. The built-in "user" role is hardcoded and not
 * stored in `organizationRole`, so it's also untouched — by design, "user"
 * stays minimal-privilege.
 */

import type { Kysely } from "kysely";
import type { Database } from "@/storage/types";

type Permission = Record<string, string[]>;

function parsePermission(raw: unknown): Permission {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed as Permission;
    } catch {
      return {};
    }
  }
  if (typeof raw === "object") {
    return raw as Permission;
  }
  return {};
}

/**
 * Append a grant of all tools on a given resource (connection / virtual MCP)
 * to every custom role in the organization.
 *
 * Idempotent: if the role already has a wildcard "*" rule or already lists
 * the resource, the existing grant is preserved.
 */
export async function grantResourceAccessToAllCustomRoles(
  db: Kysely<Database>,
  organizationId: string,
  resourceId: string,
): Promise<void> {
  const roles = await db
    .selectFrom("organizationRole")
    .select(["id", "permission"])
    .where("organizationId", "=", organizationId)
    .execute();

  if (roles.length === 0) return;

  await Promise.all(
    roles.map(async (row) => {
      const permission = parsePermission(row.permission);

      // Already has "all connections" wildcard — nothing to do.
      const wildcardTools = permission["*"];
      if (wildcardTools && wildcardTools.includes("*")) return;

      // Already has an explicit grant on this resource — preserve it.
      if (permission[resourceId]) return;

      const next: Permission = {
        ...permission,
        [resourceId]: ["*"],
      };

      await db
        .updateTable("organizationRole")
        .set({ permission: JSON.stringify(next) })
        .where("id", "=", row.id)
        .execute();
    }),
  );
}
