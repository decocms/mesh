import { useConnections } from "@decocms/mesh-sdk";
import { useParams } from "@tanstack/react-router";

const SELF_CONNECTION = { id: "self" } as const;

export function useWorkflowBindingConnection() {
  const params = useParams({ strict: false });
  const appSlug = (params as { appSlug?: string }).appSlug;

  // When accessed via the workflows route (/settings/workflows/$itemId),
  // appSlug is undefined — return "self" (the workflow plugin's own
  // connection), which matches the default used by useCollectionWorkflow.
  if (!appSlug) {
    return SELF_CONNECTION;
  }

  // When accessed via the connections route, appSlug identifies the connection.
  const connections = useConnections({ slug: appSlug });
  return connections[0] ?? SELF_CONNECTION;
}
