import { useConnections } from "@/web/hooks/collections/use-connection";
import { useBindingConnections } from "@/web/hooks/use-binding";

export function useWorkflowBindingConnection() {
  const connections = useConnections();
  const connection = useBindingConnections({
    connections,
    binding: "WORKFLOW",
  });
  if (!connection || connection.length === 0 || !connection[0]) {
    throw new Error("No workflow connection found");
  }

  return connection[0];
}
