import type { VirtualMCPEntity } from "@decocms/mesh-sdk/types";
import { useProjectContext } from "@decocms/mesh-sdk";
import { authClient } from "../../lib/auth-client.ts";
import { AgentAvatar } from "../../components/agent-icon.tsx";
import { BranchPicker } from "../../components/thread/github/branch-picker.tsx";
import { HeaderActions } from "../../components/thread/github/header-actions.tsx";
import { useChatNavigation } from "../../components/chat/hooks/use-chat-navigation.ts";
import { Toolbar } from "../../layouts/agent-shell-layout/toolbar.tsx";

export function VirtualMcpHeaderInfo({
  virtualMcp,
}: {
  virtualMcp: VirtualMCPEntity;
}) {
  const title = virtualMcp.title ?? "";
  const { org } = useProjectContext();
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id ?? "";
  const { branch, setBranch } = useChatNavigation();

  const githubRepo = virtualMcp.metadata?.githubRepo ?? null;
  const showBranchPicker = !!githubRepo?.connectionId && !!userId;

  return (
    <Toolbar.Left>
      <div className="flex items-center gap-2 min-w-0">
        <AgentAvatar icon={virtualMcp.icon} name={title} size="xs" />
        <span className="text-sm font-medium text-foreground truncate">
          {title}
        </span>
        {showBranchPicker && (
          <BranchPicker
            orgId={org.id}
            userId={userId}
            connectionId={githubRepo.connectionId!}
            owner={githubRepo.owner}
            repo={githubRepo.name}
            vmMap={virtualMcp.metadata?.vmMap}
            value={branch}
            onChange={setBranch}
          />
        )}
        {showBranchPicker && <HeaderActions virtualMcpId={virtualMcp.id} />}
      </div>
    </Toolbar.Left>
  );
}
