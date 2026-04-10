import type { ConnectionEntity } from "@decocms/mesh-sdk";
import { getConnectionSlug } from "./connection-slug";

/**
 * Strip auto-generated instance suffixes like "(2)" or "(a1b2)" from a title.
 * Matches 1-6 character parenthesized suffixes at the end of the string, which
 * covers numeric instance numbers and short base-36 clone IDs. Longer
 * parenthesized qualifiers (e.g., "(Desktop)") are preserved.
 */
const INSTANCE_SUFFIX_RE = /\s*\([^)]{1,6}\)\s*$/;

/**
 * Returns the canonical display title for a connection in catalog/card/header contexts.
 * Strips auto-generated instance suffixes from the connection title so that
 * "Vercel MCP (2)" displays as "Vercel MCP".
 *
 * Use the raw connection.title only when showing the specific instance matters
 * (e.g., the instance list inside a connection detail, or the binding selector).
 */
export function getConnectionDisplayTitle(
  connection: ConnectionEntity,
): string {
  return connection.title.replace(INSTANCE_SUFFIX_RE, "");
}

/**
 * For a group of connections sharing the same app, pick the best canonical title.
 * Uses the shortest stripped title among all instances so that user-renamed
 * instances (e.g., "Google Gmail adsfadsfa") don't pollute the group title
 * when a sibling still has the clean original name.
 */
export function getGroupDisplayTitle(connections: ConnectionEntity[]): string {
  let best = getConnectionDisplayTitle(connections[0]!);
  for (let i = 1; i < connections.length; i++) {
    const candidate = getConnectionDisplayTitle(connections[i]!);
    if (candidate.length < best.length) {
      best = candidate;
    }
  }
  return best;
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
        title: getGroupDisplayTitle(bucket),
        connections: bucket,
      });
    }
  }
  return items;
}
