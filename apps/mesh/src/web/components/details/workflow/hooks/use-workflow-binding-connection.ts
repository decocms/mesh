import { useConnections } from "@decocms/mesh-sdk";
import { useParams } from "@tanstack/react-router";

export function useWorkflowBindingConnection() {
  const { appSlug } = useParams({
    from: "/shell/$org/settings/connections/$appSlug/$collectionName/$itemId",
  });
  const connections = useConnections({ slug: appSlug });
  const connection = connections[0] ?? null;

  // Return the matched connection, or synthesize a minimal object using
  // appSlug as the connection ID (same fallback as useCollectionWorkflow).
  return connection ?? { id: appSlug };
}
