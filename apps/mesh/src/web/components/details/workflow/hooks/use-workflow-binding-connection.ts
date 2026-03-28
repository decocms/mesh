import { useConnections } from "@decocms/mesh-sdk";
import { useParams } from "@tanstack/react-router";

export function useWorkflowBindingConnection() {
  const params = useParams({ strict: false });
  const appSlug = (params as { appSlug?: string }).appSlug;

  const connections = useConnections({ slug: appSlug });
  const connection = connections[0] ?? null;

  // When accessed via the connections route, appSlug identifies the connection.
  // When accessed via the workflows route (/settings/workflows/$itemId),
  // appSlug is undefined — fall back to "self" (the workflow plugin's own
  // connection), which matches the default used by useCollectionWorkflow.
  return connection ?? { id: appSlug ?? "self" };
}
