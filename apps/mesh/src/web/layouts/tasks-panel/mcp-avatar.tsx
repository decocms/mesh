import { AgentAvatar } from "@/web/components/agent-icon";
import { useVirtualMCP } from "@decocms/mesh-sdk";

/**
 * Resolves a virtualMCP by id and renders its avatar.
 * React Query deduplicates the fetch across rows.
 */
export function McpAvatar({
  virtualMcpId,
  size = "sm",
}: {
  virtualMcpId: string | null | undefined;
  size?: "sm" | "md";
}) {
  if (!virtualMcpId) {
    return <AgentAvatar icon={null} name="?" size={size} />;
  }
  return <McpAvatarInner virtualMcpId={virtualMcpId} size={size} />;
}

function McpAvatarInner({
  virtualMcpId,
  size,
}: {
  virtualMcpId: string;
  size: "sm" | "md";
}) {
  const entity = useVirtualMCP(virtualMcpId);
  if (!entity) return <AgentAvatar icon={null} name="?" size={size} />;
  return (
    <AgentAvatar icon={entity.icon ?? null} name={entity.title} size={size} />
  );
}
