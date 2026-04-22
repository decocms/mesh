import { useProjectContext, useVirtualMCP } from "@decocms/mesh-sdk";
import { Button } from "@deco/ui/components/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@deco/ui/components/dropdown-menu.tsx";
import { Separator } from "@deco/ui/components/separator.tsx";
import { DotsHorizontal, LinkExternal01 } from "@untitledui/icons";
import { useChatBridge } from "../../chat/chat-context.tsx";
import { useChatNavigation } from "../../chat/hooks/use-chat-navigation.ts";
import { MergeSplitButton } from "./merge-split-button.tsx";
import { derivePanelState } from "./panel-state.ts";
import * as tpl from "./message-templates.ts";
import { usePrByBranch } from "./use-pr-data.ts";

interface Props {
  virtualMcpId: string;
}

/**
 * HeaderActions renders state-dependent action buttons (Create PR /
 * Merge / Rebase / Close / Reopen) in the thread header, next to the
 * branch chip. Renders nothing when the vm isn't github-linked or the
 * thread has no branch selected.
 */
export function HeaderActions({ virtualMcpId }: Props) {
  const { org } = useProjectContext();
  const vm = useVirtualMCP(virtualMcpId);
  const { branch } = useChatNavigation();
  const chat = useChatBridge();

  const githubRepo = vm?.metadata?.githubRepo ?? null;

  // Always call data hooks (React-rules) but let the query disable itself
  // via `enabled: !!branch` so we pay nothing when there's no branch.
  const prQuery = usePrByBranch({
    orgId: org.id,
    connectionId: githubRepo?.connectionId ?? "",
    owner: githubRepo?.owner ?? "",
    repo: githubRepo?.name ?? "",
    branch: branch ?? null,
  });

  if (!githubRepo?.connectionId || !branch) return null;

  const pr = prQuery.data ?? null;
  const state = derivePanelState(branch, pr);
  const disabled = chat.isStreaming;

  const send = (text: string) =>
    chat.sendMessage({ parts: [{ type: "text", text }] });
  const openExt = (url: string | undefined) => {
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  const owner = githubRepo.owner;
  const repo = githubRepo.name;
  const base = pr?.base ?? "main";

  if (state.kind === "no-branch") return null;

  if (state.kind === "no-pr") {
    return (
      <>
        <Separator orientation="vertical" className="mx-2 h-5" />
        <Button
          size="sm"
          disabled={disabled}
          onClick={() => send(tpl.createPr({ owner, repo, branch, base }))}
        >
          Create PR
        </Button>
      </>
    );
  }

  if (state.kind === "closed") {
    return (
      <>
        <Separator orientation="vertical" className="mx-2 h-5" />
        <OverflowMenu>
          <DropdownMenuItem onClick={() => openExt(state.pr.htmlUrl)}>
            <LinkExternal01 className="mr-2 h-4 w-4" />
            Open PR on GitHub
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={disabled}
            onClick={() =>
              send(tpl.reopenPr({ owner, repo, prNumber: state.pr.number }))
            }
          >
            Reopen
          </DropdownMenuItem>
        </OverflowMenu>
      </>
    );
  }

  // state.kind === "open"
  const prNumber = state.pr.number;
  return (
    <>
      <Separator orientation="vertical" className="mx-2 h-5" />
      <div className="flex items-center gap-1">
        <MergeSplitButton
          owner={owner}
          repo={repo}
          prNumber={prNumber}
          base={base}
          disabled={disabled}
          send={send}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => send(tpl.rebaseOnBase({ owner, repo, branch, base }))}
        >
          Rebase on {base}
        </Button>
        <OverflowMenu>
          <DropdownMenuItem onClick={() => openExt(state.pr.htmlUrl)}>
            <LinkExternal01 className="mr-2 h-4 w-4" />
            Open PR on GitHub
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={disabled}
            onClick={() => send(tpl.closePr({ owner, repo, prNumber }))}
          >
            Close PR
          </DropdownMenuItem>
        </OverflowMenu>
      </div>
    </>
  );
}

function OverflowMenu({ children }: { children: React.ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="More actions"
        >
          <DotsHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}
