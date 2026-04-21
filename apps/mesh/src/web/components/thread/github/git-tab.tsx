/**
 * GitTab — PR management panel for GitHub-linked virtualmcps.
 *
 * Replaces the "Instructions" tab when the vm has metadata.githubRepo set.
 * Renders one of four states based on the branch's PR status:
 *   A) No commits / no branch selected — empty-state with hint
 *   B) Commits exist, no PR — "Create PR" CTA
 *   C) PR open — title, body, external link, Merge button
 *   D) PR merged/closed — read-only summary
 *
 * All action buttons call `sendMessage` with a natural-language prompt from
 * message-templates.ts. The LLM executes the action via its GitHub tools.
 */

import { useProjectContext, useVirtualMCP } from "@decocms/mesh-sdk";
import { Button } from "@deco/ui/components/button.tsx";
import { GitBranch01, LinkExternal01 } from "@untitledui/icons";
import { useChatBridge } from "../../chat/chat-context.tsx";
import { useChatNavigation } from "../../chat/hooks/use-chat-navigation.ts";
import { usePrByBranch } from "./use-pr-data.ts";
import * as tpl from "./message-templates.ts";

export function GitTab({ virtualMcpId }: { virtualMcpId: string }) {
  const { org } = useProjectContext();
  const vm = useVirtualMCP(virtualMcpId);
  const { branch } = useChatNavigation();

  const githubRepo = vm?.metadata?.githubRepo ?? null;
  const chat = useChatBridge();

  if (!githubRepo?.connectionId) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
        This virtualmcp is not linked to a GitHub repository.
      </div>
    );
  }

  if (!branch) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-sm">
        <GitBranch01 className="h-6 w-6 text-muted-foreground" />
        <div className="text-muted-foreground">No branch selected.</div>
        <div className="text-xs text-muted-foreground">
          Pick a branch from the dropdown in the header to see PR status.
        </div>
      </div>
    );
  }

  return (
    <GitTabContent
      orgId={org.id}
      connectionId={githubRepo.connectionId}
      owner={githubRepo.owner}
      repo={githubRepo.name}
      branch={branch}
      sendMessage={chat.sendMessage}
      isStreaming={chat.isStreaming}
    />
  );
}

import type { ChatBridgeValue } from "../../chat/chat-context.tsx";

interface ContentProps {
  orgId: string;
  connectionId: string;
  owner: string;
  repo: string;
  branch: string;
  sendMessage: ChatBridgeValue["sendMessage"];
  isStreaming: boolean;
}

function GitTabContent(props: ContentProps) {
  const { orgId, connectionId, owner, repo, branch, sendMessage, isStreaming } =
    props;

  const {
    data: pr,
    isLoading,
    isError,
  } = usePrByBranch({
    orgId,
    connectionId,
    owner,
    repo,
    branch,
  });

  const send = async (text: string) => {
    await sendMessage({ parts: [{ type: "text", text }] });
  };

  const openExt = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  if (isLoading) {
    return (
      <div className="p-4 text-sm text-muted-foreground">Loading PR state…</div>
    );
  }

  if (isError) {
    return (
      <div className="p-4 text-sm text-destructive">
        Couldn't load PR state. The GitHub connection may be broken.
      </div>
    );
  }

  const base = pr?.base ?? "main";
  const branchUrl = `https://github.com/${owner}/${repo}/tree/${branch}`;

  // State D: merged / closed
  if (pr && pr.state === "closed") {
    return (
      <div className="flex flex-col gap-4 p-4">
        <div className="text-sm text-success">
          {pr.merged ? "✓ Merged" : "✗ Closed"} into {pr.base}
          {pr.mergedAt && <> · {new Date(pr.mergedAt).toLocaleDateString()}</>}
          {pr.author && <> · by @{pr.author}</>}
        </div>
        <h1 className="text-lg font-semibold">{pr.title}</h1>
        {pr.body && (
          <div className="whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 text-sm">
            {pr.body}
          </div>
        )}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => openExt(pr.htmlUrl)}
          >
            <LinkExternal01 className="mr-1.5 h-4 w-4" />
            Open PR #{pr.number} on GitHub
          </Button>
        </div>
      </div>
    );
  }

  // State C: PR open
  if (pr && pr.state === "open") {
    return (
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <GitBranch01 className="h-3.5 w-3.5" />
            <span className="font-mono">
              {branch} → {pr.base}
            </span>
            <span>·</span>
            <span>#{pr.number}</span>
            {pr.author && <span>· @{pr.author}</span>}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => openExt(pr.htmlUrl)}
            title="Open on GitHub"
          >
            <LinkExternal01 className="h-4 w-4" />
          </Button>
        </div>
        <h1 className="text-lg font-semibold">{pr.title}</h1>
        {pr.body && (
          <div className="whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 text-sm">
            {pr.body}
          </div>
        )}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            disabled={isStreaming}
            onClick={() =>
              send(tpl.mergeSquash({ prNumber: pr.number, base: pr.base }))
            }
          >
            Squash & merge
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isStreaming}
            onClick={() => send(tpl.rebaseOnBase({ branch, base: pr.base }))}
          >
            Rebase on {pr.base}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={isStreaming}
            onClick={() => send(tpl.closePr({ prNumber: pr.number }))}
          >
            Close PR
          </Button>
        </div>
      </div>
    );
  }

  // State B: No PR yet
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <GitBranch01 className="h-3.5 w-3.5" />
        <span className="font-mono">{branch}</span>
        <span>·</span>
        <span>No pull request yet</span>
      </div>
      <div className="rounded-md border border-border bg-muted/30 p-4 text-sm">
        This branch doesn't have an open pull request. Click "Create PR" to open
        one; the agent will draft the title and summary from the current state
        of the branch.
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={isStreaming}
          onClick={() => send(tpl.createPr({ branch, base }))}
        >
          Create PR
        </Button>
        <Button size="sm" variant="outline" onClick={() => openExt(branchUrl)}>
          <LinkExternal01 className="mr-1.5 h-4 w-4" />
          Open branch on GitHub
        </Button>
      </div>
    </div>
  );
}
