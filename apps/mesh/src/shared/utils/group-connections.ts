import type { ConnectionEntity } from "@decocms/mesh-sdk";
import { getConnectionSlug } from "./connection-slug";

/**
 * Strip auto-generated instance suffixes like "(2)" or "(a1b2)" from a title.
 * Matches 1-6 character parenthesized suffixes at the end of the string.
 */
const INSTANCE_SUFFIX_RE = /\s*\([^)]{1,6}\)\s*$/;

/**
 * Strip instance suffix from a connection title.
 * "Vercel (2)" → "Vercel", "Gmail (a1b2)" → "Gmail"
 */
export function getConnectionDisplayTitle(
  connection: ConnectionEntity,
): string {
  return connection.title.replace(INSTANCE_SUFFIX_RE, "");
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

/**
 * Groups connections by their slug (app_name or derived from URL/title).
 * Accepts an optional registry title lookup so group/single cards show
 * the canonical registry name instead of the (possibly renamed) instance title.
 */
export function groupConnections(
  connections: ConnectionEntity[],
  registryTitles?: Map<string, string>,
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
    const registryTitle = first.app_name && registryTitles?.get(first.app_name);

    if (bucket.length === 1) {
      items.push({ type: "single", connection: first });
    } else {
      items.push({
        type: "group",
        key,
        icon: first.icon,
        title: registryTitle || getConnectionDisplayTitle(first),
        connections: bucket,
      });
    }
  }
  return items;
}
