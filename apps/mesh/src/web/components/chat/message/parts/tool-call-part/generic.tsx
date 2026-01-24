"use client";

import type { ToolUIPart, DynamicToolUIPart } from "ai";
import type { ToolDefinition } from "@decocms/mesh-sdk";
import { Atom02, LayersTwo01 } from "@untitledui/icons";
import { Suspense } from "react";
import { ToolCallShell } from "./common.tsx";
import {
  getFriendlyToolName,
  getApprovalId,
  getEffectiveState,
} from "./utils.tsx";
import { getToolPartErrorText, safeStringify } from "../utils.ts";
import { ApprovalActions } from "./approval-actions.tsx";
import { useProjectContext } from "@decocms/mesh-sdk";
import { useChat } from "../../context.tsx";
import { getUIResourceUri } from "@/mcp-apps/types.ts";
import { MCPAppLoader } from "../mcp-app-loader.tsx";

interface GenericToolCallPartProps {
  part: ToolUIPart | DynamicToolUIPart;
  /** Kept for backwards compatibility with assistant.tsx call sites (unused internally) */
  id?: string;
  /** Optional MCP tool annotations to render as badges */
  annotations?: ToolDefinition["annotations"];
  /** Latency in seconds from data-tool-metadata part */
  latency?: number;
}

function safeStringifyFormatted(value: unknown): string {
  const str = safeStringify(value);
  if (str === "" || str === "[Non-serializable value]") return str;
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str;
  }
}

function getTitle(state: string, friendlyName: string): string {
  switch (state) {
    case "input-streaming":
    case "input-available":
      return `Calling ${friendlyName}...`;
    case "approval-requested":
      return `Approve ${friendlyName}`;
    case "output-denied":
      return `Denied ${friendlyName}`;
    case "output-available":
      return `Called ${friendlyName}`;
    case "output-error":
      return `Error calling ${friendlyName}`;
    default:
      return `Calling ${friendlyName}...`;
  }
}

function getSummary(state: string): string {
  switch (state) {
    case "input-streaming":
    case "input-available":
      return "Generating input";
    case "approval-requested":
      return "Waiting for approval";
    case "output-denied":
      return "Execution denied";
    case "output-available":
      return "Tool answered";
    case "output-error":
      return "Tool failed";
    default:
      return "Calling tool";
  }
}

export function GenericToolCallPart({
  part,
  annotations,
  latency,
}: GenericToolCallPartProps) {
  // Extract tool name with proper dynamic-tool handling
  const toolName =
    "toolName" in part && typeof part.toolName === "string"
      ? part.toolName
      : part.type === "dynamic-tool"
        ? "Dynamic Tool"
        : part.type.replace("tool-", "") || "Tool";
  const friendlyName = getFriendlyToolName(toolName);

  // Compute state-dependent props
  const title = getTitle(part.state, friendlyName);
  const summary = getSummary(part.state);

  // Derive UI state for ToolCallShell
  const effectiveState = getEffectiveState(part.state);

  // Get project context and virtual MCP from chat context
  const { org } = useProjectContext();
  const { selectedVirtualMcp } = useChat();

  // Extract UI resource URI from tool output's _meta (if present)
  const toolOutput = part.state === "output-available" ? part.output : null;
  const uiResourceUri = getUIResourceUri(
    toolOutput && typeof toolOutput === "object" && "_meta" in toolOutput
      ? (toolOutput as Record<string, unknown>)._meta
      : undefined,
  );

  // Get connectionId from the tool output's _meta as well
  const toolConnectionId =
    toolOutput &&
    typeof toolOutput === "object" &&
    "_meta" in toolOutput &&
    typeof (toolOutput as Record<string, unknown>)._meta === "object" &&
    (toolOutput as Record<string, unknown>)._meta !== null &&
    "connectionId" in
      ((toolOutput as Record<string, unknown>)._meta as Record<string, unknown>)
      ? String(
          (
            (toolOutput as Record<string, unknown>)._meta as Record<
              string,
              unknown
            >
          ).connectionId,
        )
      : (selectedVirtualMcp?.id ?? null);

  // Check if this tool has an MCP App and output is available
  const hasMCPApp = !!uiResourceUri && part.state === "output-available";
  const canRenderMCPApp = hasMCPApp && !!toolConnectionId && !!org?.id;

  // Build expanded content
  let detail = "";
  if (part.input !== undefined) {
    detail += "# Input\n" + safeStringifyFormatted(part.input);
  }

  if (part.state === "output-error") {
    const errorText = getToolPartErrorText(part);
    if (detail) detail += "\n\n";
    detail += "# Error\n" + errorText;
  } else if (part.output !== undefined && !hasMCPApp) {
    if (detail) detail += "\n\n";
    detail += "# Output\n" + safeStringifyFormatted(part.output);
  }

  // Build approval actions for approval-requested state
  const approvalId = getApprovalId(part);
  const actions = approvalId ? (
    <ApprovalActions approvalId={approvalId} />
  ) : undefined;

  return (
    <div className="my-2 flex flex-col gap-2">
      <ToolCallShell
        icon={
          hasMCPApp ? (
            <LayersTwo01 className="size-4 text-primary" />
          ) : (
            <Atom02 className="size-4 text-muted-foreground" />
          )
        }
        title={title}
        annotations={annotations}
        latency={latency}
        summary={summary}
        state={effectiveState}
        detail={detail || null}
        actions={actions}
      />
      {canRenderMCPApp && (
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-32 border border-border rounded-lg">
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="size-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Loading app...</span>
              </div>
            </div>
          }
        >
          <MCPAppLoader
            uiResourceUri={uiResourceUri!}
            connectionId={toolConnectionId!}
            orgId={org!.id}
            toolName={toolName}
            friendlyName={friendlyName}
            toolInput={part.input}
            toolResult={part.output}
            minHeight={150}
            maxHeight={400}
            className="border border-border rounded-lg"
          />
        </Suspense>
      )}
    </div>
  );
}
