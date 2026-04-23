import type { VirtualMCPEntity } from "@decocms/mesh-sdk/types";
import { Users03 } from "@untitledui/icons";
import { IntegrationIcon } from "../../components/integration-icon";
import { HeaderActions } from "../../components/thread/github/header-actions.tsx";
import { Toolbar } from "../../layouts/agent-shell-layout/toolbar.tsx";

export function VirtualMcpHeaderInfo({
  virtualMcp,
}: {
  virtualMcp: VirtualMCPEntity;
}) {
  const githubRepo = virtualMcp.metadata?.githubRepo ?? null;
  const showActions = !!githubRepo?.connectionId;

  return (
    <>
      <Toolbar.Center>
        <div className="flex items-center gap-2 min-w-0">
          <IntegrationIcon
            icon={virtualMcp.icon}
            name={virtualMcp.title}
            size="xs"
            fallbackIcon={<Users03 size={14} />}
            className="size-5 min-w-5 rounded-md"
          />
          <span className="text-sm font-medium text-foreground truncate">
            {virtualMcp.title}
          </span>
        </div>
      </Toolbar.Center>
      {showActions && (
        <Toolbar.Right>
          <HeaderActions virtualMcpId={virtualMcp.id} />
        </Toolbar.Right>
      )}
    </>
  );
}
