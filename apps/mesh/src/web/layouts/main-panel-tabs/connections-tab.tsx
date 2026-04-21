import { VirtualMcpDetailView } from "@/web/views/virtual-mcp";

export function ConnectionsTab({ virtualMcpId }: { virtualMcpId: string }) {
  return (
    <VirtualMcpDetailView
      virtualMcpId={virtualMcpId}
      forceTab="connections"
      hideOwnTabBar
      hideOwnTitle
    />
  );
}
