import type { ConnectionEntity } from "../../tools/connection/schema";

/**
 * Hook to find a connection that represents a publisher
 *
 * Searches through connections to find one that corresponds to the publisher
 * by matching against app_name, app_id, or title.
 *
 * @param connections - Array of available connections
 * @param publisherName - Name of the publisher to search for
 * @returns The matching connection if found, undefined otherwise
 */
export function usePublisherConnection(
  connections: ConnectionEntity[] | undefined,
  publisherName: string | undefined,
): ConnectionEntity | undefined {
  if (!connections || !publisherName) return undefined;

  const publisherLower = publisherName.toLowerCase();

  // Try to find a connection matching the publisher
  // Priority: app_name > app_id > title (case-insensitive)
  return (
    connections.find(
      (conn) =>
        conn.app_name?.toLowerCase() === publisherLower ||
        conn.app_id?.toLowerCase() === publisherLower ||
        conn.title.toLowerCase() === publisherLower,
    ) ||
    // Fallback: fuzzy match on title if publisher name is contained in connection title
    connections.find((conn) =>
      conn.title.toLowerCase().includes(publisherLower),
    )
  );
}
