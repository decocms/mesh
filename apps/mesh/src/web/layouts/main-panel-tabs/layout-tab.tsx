import { VirtualMcpDetailView } from "@/web/views/virtual-mcp";

export function LayoutTab({ virtualMcpId }: { virtualMcpId: string }) {
  return (
    <VirtualMcpDetailView
      virtualMcpId={virtualMcpId}
      forceTab="layout"
      hideOwnTabBar
      hideOwnTitle
    />
  );
}
