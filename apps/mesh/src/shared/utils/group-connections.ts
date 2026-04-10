import type { ConnectionEntity } from "@decocms/mesh-sdk";
import { getConnectionSlug } from "./connection-slug";
import { slugify } from "./slugify";

/**
 * Strip auto-generated instance suffixes like "(2)" or "(a1b2)" from a title.
 */
const INSTANCE_SUFFIX_RE = /\s*\([^)]{1,6}\)\s*$/;

/**
 * Convert an app_name slug to a display title as a last resort.
 * "google-gmail" → "Google Gmail", "@scope/tool" → "Tool"
 */
function slugToTitle(appName: string): string {
  const slug = appName.replace(/^@[^/]+\//, "");
  return slug.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Check whether a stripped title looks like the original (not user-renamed)
 * by comparing its slug against app_name. Allows partial matches at word
 * boundaries so that "Vercel" matches "vercel-mcp" and "Vercel MCP Server"
 * matches "vercel-mcp".
 */
function isOriginalTitle(titleSlug: string, appName: string): boolean {
  return (
    titleSlug === appName ||
    appName.startsWith(titleSlug + "-") ||
    titleSlug.startsWith(appName + "-")
  );
}

/**
 * Returns the canonical display title for a connection in catalog/card/header contexts.
 *
 * Strategy:
 * 1. Strip auto-generated instance suffixes from the title ("Vercel MCP (2)" → "Vercel MCP")
 * 2. If the stripped title still matches the app_name slug (exact or word-boundary prefix),
 *    use it — this preserves the original casing from the registry (e.g., "Vercel MCP")
 * 3. If it doesn't match (user renamed the instance), fall back to slug → title conversion
 *
 * Use the raw connection.title only when showing the specific instance matters
 * (e.g., the instance list inside a connection detail, or the binding selector).
 */
export function getConnectionDisplayTitle(
  connection: ConnectionEntity,
): string {
  const stripped = connection.title.replace(INSTANCE_SUFFIX_RE, "");
  if (!connection.app_name) return stripped;

  if (isOriginalTitle(slugify(stripped), connection.app_name)) {
    return stripped;
  }

  // Title was renamed — fall back to slug conversion
  return slugToTitle(connection.app_name);
}

/**
 * For a group of connections sharing the same app, pick the best canonical title.
 * Prefers the original (non-renamed) title from any instance to preserve correct
 * casing. Falls back to the shortest stripped title.
 */
export function getGroupDisplayTitle(connections: ConnectionEntity[]): string {
  const appName = connections[0]!.app_name;

  // First pass: look for an instance whose title still matches the app_name
  // (i.e. hasn't been renamed). This preserves original casing like "Vercel MCP".
  if (appName) {
    for (const c of connections) {
      const stripped = c.title.replace(INSTANCE_SUFFIX_RE, "");
      if (isOriginalTitle(slugify(stripped), appName)) {
        return stripped;
      }
    }
    // All instances were renamed — fall back to slug conversion
    return slugToTitle(appName);
  }

  // No app_name — pick the shortest stripped title
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
