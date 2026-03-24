import { useConnections } from "@decocms/mesh-sdk";

export function useWorkflowBindingConnection() {
  const connections = useConnections({ binding: "WORKFLOW" });
  if (!connections || connections.length === 0 || !connections[0]) {
    throw new Error("No workflow connection found");
  }

  return connections[0];
}
