import { useConnections } from "@decocms/mesh-sdk";
import { useParams } from "@tanstack/react-router";

export function useWorkflowBindingConnection() {
  const params = useParams({ strict: false });
  const appSlug = (params as { appSlug?: string }).appSlug;

  // Always call the hook to satisfy React's rules of hooks.
  // When appSlug is undefined the slug filter is omitted, but we ignore the
  // result below and fall back to "self".
  const connections = useConnections({ slug: appSlug });

  // When accessed via the workflows route (/settings/workflows/$itemId),
  // appSlug is undefined — fall back to "self" (the workflow plugin's own
  // connection), which matches the default used by useCollectionWorkflow.
  if (!appSlug) {
    return { id: "self" as const };
  }

  // When accessed via the connections route, appSlug identifies the connection.
  // If the slug-filtered query hasn't resolved yet, preserve the requested slug
  // rather than incorrectly falling back to "self".
  return connections[0] ?? { id: appSlug };
}
