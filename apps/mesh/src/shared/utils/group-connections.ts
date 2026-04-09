import type { ConnectionEntity } from "@decocms/mesh-sdk";
import { getConnectionSlug } from "./connection-slug";

/**
 * Returns the canonical display title for a connection in catalog/card/header contexts.
 * For registry-installed connections (those with app_name set), the canonical name is
 * derived from the stable app_name slug so that user-renamed instances don't pollute
 * the group title. For custom connections (no app_name), the user-set title is used.
 *
 * Use the raw connection.title only when showing the specific instance matters
 * (e.g., the instance list inside a connection detail, or the binding selector).
 */
export function getConnectionDisplayTitle(
  connection: ConnectionEntity,
): string {
  if (connection.app_name) {
    // Convert slug → display title: "google-gmail" → "Google Gmail"
    // Strip optional scope prefix like "@scope/name" first.
    const slug = connection.app_name.replace(/^@[^/]+\//, "");
    return slug.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return connection.title;
}

export interface ConnectionGroup {
  type: "group";
  key: string;
  icon: string | null;
  title: string;
  connections: ConnectionEntity[];
}

export interface SingleConnection {
  type: "single";
  connection: ConnectionEntity;
}

export type GroupedItem = SingleConnection | ConnectionGroup;

export function groupConnections(
  connections: ConnectionEntity[],
): GroupedItem[] {
  const buckets = new Map<string, ConnectionEntity[]>();
  for (const c of connections) {
    const key = getConnectionSlug(c);
    const list = buckets.get(key);
    if (list) {
      list.push(c);
    } else {
      buckets.set(key, [c]);
    }
  }

  const items: GroupedItem[] = [];
  const seen = new Set<string>();

  for (const c of connections) {
    const key = getConnectionSlug(c);
    if (seen.has(key)) continue;
    seen.add(key);

    const bucket = buckets.get(key)!;
    const first = bucket[0]!;
    if (bucket.length === 1) {
      items.push({ type: "single", connection: first });
    } else {
      items.push({
        type: "group",
        key,
        icon: first.icon,
        title: getConnectionDisplayTitle(first),
        connections: bucket,
      });
    }
  }
  return items;
}
