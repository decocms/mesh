"use client";

import { Users03 } from "@untitledui/icons";
import type { ToolDefinition } from "@decocms/mesh-sdk";
import { ToolCallShell } from "./common.tsx";
import { IntegrationIcon } from "@/web/components/integration-icon";
import { ToolAnnotationBadges } from "@/web/components/tools";
import { useChat } from "../../../context.tsx";
import type { SubtaskToolPart } from "../../../types.ts";
import type { SubtaskResultMeta } from "@/api/routes/decopilot/built-in-tools/subtask";
import { extractTextFromOutput, getToolPartErrorText } from "../utils.ts";

interface SubtaskPartProps {
  part: SubtaskToolPart;
  /** Subtask result from data part */
  subtaskMeta?: SubtaskResultMeta;
  /** Tool annotations from data part */
  annotations?: ToolDefinition["annotations"];
}

export function SubtaskPart({
  part,
  subtaskMeta,
  annotations,
}: SubtaskPartProps) {
  const { virtualMcps } = useChat();

  // State computation
  const isInputStreaming =
    part.state === "input-streaming" || part.state === "input-available";
  const isOutputStreaming =
    part.state === "output-available" && part.preliminary === true;
  const isComplete = part.state === "output-available" && !part.preliminary;
  const isError = part.state === "output-error";

  // Derive UI state for ToolCallShell
  const effectiveState: "loading" | "error" | "idle" = isError
    ? "error"
    : isInputStreaming || isOutputStreaming
      ? "loading"
      : "idle";

  // Agent lookup
  const agentId = part.input?.agent_id;
  const agent = agentId ? virtualMcps.find((v) => v.id === agentId) : null;

  // Usage extraction from data part
  const usage = subtaskMeta?.usage;
  const tokens = usage && usage.totalTokens > 0 ? usage.totalTokens : undefined;

  // Title mapping
  const title: string = agent?.title
    ? agent.title
    : isInputStreaming
      ? "Starting subtask..."
      : isOutputStreaming
        ? "Subtask running..."
        : isComplete
          ? "Subtask completed"
          : isError
            ? "Subtask failed"
            : "Subtask";

  // Summary (task prompt)
  const summary = part.input?.prompt ?? "";

  // Detail (expanded content)
  const response = isError
    ? getToolPartErrorText(part)
    : (extractTextFromOutput(part.output) ?? "No output available");
  const detail = `# Task\n${part.input?.prompt ?? "No prompt provided"}\n\n# ${isError ? "Error" : "Execution"}\n${response}`;

  // Icon
  const icon = (
    <IntegrationIcon
      icon={agent?.icon}
      name={agent?.title ?? "Subtask"}
      size="2xs"
      fallbackIcon={<Users03 />}
    />
  );

  return (
    <div className="my-2">
      <ToolCallShell
        icon={icon}
        title={title}
        badges={
          annotations ? (
            <ToolAnnotationBadges annotations={annotations} />
          ) : undefined
        }
        usage={tokens ? { tokens } : undefined}
        summary={summary}
        state={effectiveState}
        detail={detail}
      />
    </div>
  );
}
