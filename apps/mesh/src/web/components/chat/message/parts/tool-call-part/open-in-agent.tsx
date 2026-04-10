"use client";

import { IntegrationIcon } from "@/web/components/integration-icon";
import { useNavigateToAgent } from "@/web/hooks/use-navigate-to-agent";
import { useOrg, useVirtualMCP, type ToolDefinition } from "@decocms/mesh-sdk";
import { Spinner } from "@deco/ui/components/spinner.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { ArrowRight, Users03 } from "@untitledui/icons";
import { useRef } from "react";
import { getEffectiveState } from "./utils.tsx";

type OpenInAgentToolPart = Extract<
  import("../../../types.ts").ChatMessage["parts"][number],
  { type: "tool-open_in_agent" }
>;

interface OpenInAgentPartProps {
  part: OpenInAgentToolPart;
  annotations?: ToolDefinition["annotations"];
  latency?: number;
}

/**
 * Module-level set prevents duplicate stream starts across re-renders
 * within the same page session. sessionStorage covers page refreshes.
 */
const startedTasks = new Set<string>();

function isAlreadyStarted(taskId: string): boolean {
  if (startedTasks.has(taskId)) return true;
  try {
    return sessionStorage.getItem(`open-in-agent:${taskId}`) === "1";
  } catch {
    return false;
  }
}

function markStarted(taskId: string) {
  startedTasks.add(taskId);
  try {
    sessionStorage.setItem(`open-in-agent:${taskId}`, "1");
  } catch {
    // sessionStorage might be unavailable
  }
}

export function OpenInAgentPart({ part }: OpenInAgentPartProps) {
  const org = useOrg();
  const navigateToAgent = useNavigateToAgent();
  const startFiredRef = useRef(false);

  const agentId = part.input?.agent_id;
  const context = part.input?.context;
  const agent = useVirtualMCP(agentId);

  const output = part.output as Record<string, unknown> | undefined;
  const taskId = output?.task_id as string | undefined;

  const rawState = getEffectiveState(
    part.state,
    "preliminary" in part ? part.preliminary : false,
  );
  const isComplete = part.state === "output-available" && !part.preliminary;
  const isError = part.state === "output-error";
  const isLoading = rawState === "loading";

  // Start the agent stream via the standard decopilot/stream endpoint.
  // Idempotent: module-level Set (re-renders) + sessionStorage (refreshes).
  if (
    isComplete &&
    taskId &&
    context &&
    agentId &&
    !startFiredRef.current &&
    !isAlreadyStarted(taskId)
  ) {
    startFiredRef.current = true;
    markStarted(taskId);

    queueMicrotask(() => {
      const now = new Date().toISOString();
      fetch(`/api/${org.slug}/decopilot/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          messages: [
            {
              id: crypto.randomUUID(),
              role: "user",
              parts: [{ type: "text", text: context }],
              metadata: {
                thread_id: taskId,
                agent: { id: agentId },
                created_at: now,
              },
            },
          ],
          thread_id: taskId,
          agent: { id: agentId },
          toolApprovalLevel: "auto",
        }),
      }).catch((err) =>
        console.error("[open_in_agent] stream start failed:", err),
      );
    });
  }

  const title = agent?.title ?? (isError ? "Agent not found" : "Agent");

  const handleClick = () => {
    if (!agentId || !isComplete) return;
    navigateToAgent(agentId, {
      search: taskId ? { taskId } : undefined,
    });
  };

  return (
    <div
      role={isComplete ? "button" : undefined}
      tabIndex={isComplete ? 0 : undefined}
      onClick={isComplete ? handleClick : undefined}
      onKeyDown={
        isComplete
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleClick();
              }
            }
          : undefined
      }
      className={cn(
        "flex items-center gap-3 py-2.5 px-1 rounded-md transition-colors",
        isComplete && "cursor-pointer [@media(hover:hover)]:hover:bg-accent/30",
        isLoading && "shimmer",
      )}
    >
      <div className="shrink-0 size-5 flex items-center justify-center">
        <IntegrationIcon
          icon={agent?.icon}
          name={agent?.title ?? "Agent"}
          size="2xs"
          className="rounded-xs"
          fallbackIcon={<Users03 />}
        />
      </div>

      <span className="text-sm font-medium text-foreground truncate">
        {title}
      </span>

      {isLoading && <Spinner size="xs" />}

      {isComplete && (
        <>
          <span className="text-xs text-muted-foreground">Open</span>
          <ArrowRight size={14} className="text-muted-foreground shrink-0" />
        </>
      )}

      {isError && <span className="text-xs text-destructive">Failed</span>}
    </div>
  );
}
