import { useProjectContext } from "@decocms/mesh-sdk";
import type { VirtualMCPEntity } from "@decocms/mesh-sdk/types";
import { GitBranch01, LinkExternal01, Users03 } from "@untitledui/icons";
import { IntegrationIcon } from "../../components/integration-icon";
import { useChatNavigation } from "../../components/chat/hooks/use-chat-navigation.ts";
import { HeaderActions } from "../../components/thread/github/header-actions.tsx";
import { usePrByBranch } from "../../components/thread/github/use-pr-data.ts";
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
          {githubRepo?.connectionId && (
            <GitContext
              connectionId={githubRepo.connectionId}
              owner={githubRepo.owner}
              repo={githubRepo.name}
            />
          )}
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

function GitContext({
  connectionId,
  owner,
  repo,
}: {
  connectionId: string;
  owner: string;
  repo: string;
}) {
  const { org } = useProjectContext();
  const { branch } = useChatNavigation();
  const { data: pr } = usePrByBranch({
    orgId: org.id,
    connectionId,
    owner,
    repo,
    branch: branch ?? null,
  });

  if (!branch) return null;

  const branchUrl = `https://github.com/${owner}/${repo}/tree/${branch}`;
  const showPr = pr && !pr.merged;

  return (
    <>
      <Separator />
      <a
        href={branchUrl}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open branch ${branch} on GitHub`}
        className="inline-flex shrink-0 items-center gap-1 rounded px-1 text-xs font-mono text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <GitBranch01 className="h-3.5 w-3.5" />
        {branch}
      </a>
      {showPr && (
        <>
          <Separator />
          <a
            href={pr.htmlUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open PR #${pr.number} on GitHub`}
            className="inline-flex shrink-0 items-center gap-1 rounded px-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            #{pr.number}
            <LinkExternal01 className="h-3 w-3" />
          </a>
        </>
      )}
    </>
  );
}

function Separator() {
  return (
    <span className="shrink-0 text-muted-foreground/60 select-none">·</span>
  );
}
