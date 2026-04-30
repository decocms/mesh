import { VirtualMcpDetailView } from "@/web/views/virtual-mcp";
import { useCapability } from "@/web/hooks/use-capability";
import { NoPermissionState } from "@/web/components/no-permission-state";

export function SettingsTab({ virtualMcpId }: { virtualMcpId: string }) {
  const { granted, loading } = useCapability("agents:manage");

  if (loading) return null;
  if (!granted) {
    return <NoPermissionState area="agent settings" />;
  }

  return <VirtualMcpDetailView virtualMcpId={virtualMcpId} hideOwnTitle />;
}
