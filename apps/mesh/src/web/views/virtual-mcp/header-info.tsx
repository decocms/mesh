import type { VirtualMCPEntity } from "@decocms/mesh-sdk/types";
import { AgentAvatar } from "../../components/agent-icon.tsx";
import { HeaderActions } from "../../components/thread/github/header-actions.tsx";
import { Toolbar } from "../../layouts/agent-shell-layout/toolbar.tsx";

export function VirtualMcpHeaderInfo({
  virtualMcp,
}: {
  virtualMcp: VirtualMCPEntity;
}) {
  const title = virtualMcp.title ?? "";
  const showActions = !!virtualMcp.metadata?.githubRepo?.connectionId;

  return (
    <>
      <Toolbar.Left>
        <div className="flex items-center gap-2 min-w-0">
          <AgentAvatar icon={virtualMcp.icon} name={title} size="xs" />
          <span className="text-sm font-medium text-foreground truncate">
            {title}
          </span>
        </div>
      </Toolbar.Left>
      {showActions && (
        <Toolbar.Right>
          <HeaderActions virtualMcpId={virtualMcp.id} />
        </Toolbar.Right>
      )}
    </>
  );
}
