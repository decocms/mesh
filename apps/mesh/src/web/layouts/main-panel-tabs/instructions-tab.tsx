import { VirtualMcpDetailView } from "@/web/views/virtual-mcp";

export function InstructionsTab({ virtualMcpId }: { virtualMcpId: string }) {
  return (
    <VirtualMcpDetailView
      virtualMcpId={virtualMcpId}
      forceTab="instructions"
      hideOwnTabBar
      hideOwnTitle
    />
  );
}
