import { useProjectContext, useVirtualMCP } from "@decocms/mesh-sdk";
import { Button } from "@deco/ui/components/button.tsx";
import { Separator } from "@deco/ui/components/separator.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import { authClient } from "@/web/lib/auth-client";
import { useChatBridge } from "../../chat/chat-context.tsx";
import { useChatNavigation } from "../../chat/hooks/use-chat-navigation.ts";
import { MergeSplitButton } from "./merge-split-button.tsx";
import { selectHeaderButton, type HeaderButton } from "./panel-state.ts";
import * as tpl from "./message-templates.ts";
import { useBranchStatus } from "./use-branch-status.ts";
import { useChecks, usePrByBranch } from "./use-pr-data.ts";
import { usePrReviews } from "./use-pr-reviews.ts";

interface Props {
  virtualMcpId: string;
}

/**
 * HeaderActions renders a single next-action button for the current branch +
 * PR state. The button never performs the action directly; clicks send a
 * templated prompt into the chat for the agent to execute.
 *
 * Gated on `!!githubRepo?.connectionId && !!branch` (the caller also gates).
 * When the VM is not yet connected (no branchStatus event received), renders
 * null — avoids flashing a misleading label before we know the working-tree
 * state.
 */
export function HeaderActions({ virtualMcpId }: Props) {
  const { org } = useProjectContext();
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id ?? null;
  const vm = useVirtualMCP(virtualMcpId);
  const { branch } = useChatNavigation();
  const chat = useChatBridge();

  const githubRepo = vm?.metadata?.githubRepo ?? null;

  const branchStatus = useBranchStatus({
    virtualMcpId,
    userId,
    branch: branch ?? null,
  });

  const prQuery = usePrByBranch({
    orgId: org.id,
    connectionId: githubRepo?.connectionId ?? "",
    owner: githubRepo?.owner ?? "",
    repo: githubRepo?.name ?? "",
    branch: branch ?? null,
  });
  const pr = prQuery.data ?? null;

  const checksQuery = useChecks({
    orgId: org.id,
    connectionId: githubRepo?.connectionId ?? "",
    owner: githubRepo?.owner ?? "",
    repo: githubRepo?.name ?? "",
    prNumber: pr && pr.state === "open" ? pr.number : null,
  });

  const reviewsQuery = usePrReviews({
    orgId: org.id,
    connectionId: githubRepo?.connectionId ?? "",
    owner: githubRepo?.owner ?? "",
    repo: githubRepo?.name ?? "",
    prNumber: pr && pr.state === "open" ? pr.number : null,
  });

  if (!githubRepo?.connectionId || !branch) return null;

  const button = selectHeaderButton({
    branchStatus,
    pr,
    checks: checksQuery.data ?? [],
    reviews: reviewsQuery.data ?? null,
  });

  if (!button) return null;

  const send = (text: string) =>
    chat.sendMessage({ parts: [{ type: "text", text }] });

  const owner = githubRepo.owner;
  const repo = githubRepo.name;
  const base = pr?.base ?? branchStatus?.base ?? "main";
  const isStreaming = chat.isStreaming;

  const onActivate = (action: HeaderButton["action"]) => {
    if (isStreaming) return;
    switch (action) {
      case "commit-and-push":
        void send(tpl.commitAndPush({ owner, repo, branch }));
        return;
      case "create-pr":
        void send(tpl.createPr({ owner, repo, branch, base }));
        return;
      case "reopen":
        if (pr) void send(tpl.reopenPr({ owner, repo, prNumber: pr.number }));
        return;
      case "rebase":
        void send(tpl.rebaseOnBase({ owner, repo, branch, base }));
        return;
      case "fix-checks":
        if (pr)
          void send(
            tpl.fixChecks({
              owner,
              repo,
              prNumber: pr.number,
              failingChecks: button.meta?.failingChecks ?? [],
            }),
          );
        return;
      case "mark-ready":
        if (pr)
          void send(
            tpl.markReadyForReview({ owner, repo, prNumber: pr.number }),
          );
        return;
      case "resolve-comments":
        if (pr)
          void send(
            tpl.resolveReviewComments({ owner, repo, prNumber: pr.number }),
          );
        return;
      case "merge-split":
        // MergeSplitButton handles its own click wiring.
        return;
    }
  };

  return (
    <>
      <Separator
        orientation="vertical"
        className="mx-2 data-[orientation=vertical]:h-5"
      />
      <HeaderButtonRenderer
        button={button}
        isStreaming={isStreaming}
        onActivate={onActivate}
        owner={owner}
        repo={repo}
        prNumber={pr?.number}
        base={base}
        send={send}
      />
    </>
  );
}

function HeaderButtonRenderer(props: {
  button: HeaderButton;
  isStreaming: boolean;
  onActivate: (action: HeaderButton["action"]) => void;
  owner: string;
  repo: string;
  prNumber?: number;
  base: string;
  send: (text: string) => Promise<void> | void;
}) {
  const { button, isStreaming } = props;
  const disabled = Boolean(button.disabled) || isStreaming;
  const tooltipLabel = isStreaming ? "Chat is running" : null;

  if (button.action === "merge-split" && props.prNumber != null) {
    return (
      <WithTooltip label={tooltipLabel}>
        <MergeSplitButton
          owner={props.owner}
          repo={props.repo}
          prNumber={props.prNumber}
          base={props.base}
          disabled={disabled}
          send={props.send}
        />
      </WithTooltip>
    );
  }

  return (
    <WithTooltip label={tooltipLabel}>
      <Button
        size="sm"
        variant={button.disabled ? "outline" : "default"}
        disabled={disabled}
        onClick={() => props.onActivate(button.action)}
      >
        {button.label}
      </Button>
    </WithTooltip>
  );
}

function WithTooltip({
  label,
  children,
}: {
  label: string | null;
  children: React.ReactNode;
}) {
  if (!label) return <>{children}</>;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span>{children}</span>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
