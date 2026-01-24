"use client";

import type { ToolUIPart, DynamicToolUIPart } from "ai";
import type { ToolDefinition } from "@decocms/mesh-sdk";
import { Atom02, LayersTwo01 } from "@untitledui/icons";
import { useState } from "react";
import { ToolCallShell } from "./common.tsx";
import {
  getFriendlyToolName,
  getApprovalId,
  getEffectiveState,
} from "./utils.tsx";
import { getToolPartErrorText, safeStringify } from "../utils.ts";
import { ApprovalActions } from "./approval-actions.tsx";
import { useMCPClient } from "@decocms/mesh-sdk";
import { useChat } from "../../context.tsx";
import { useToolUIResource } from "@/mcp-apps/use-tool-ui-resource.ts";
import { MCPAppRenderer } from "@/mcp-apps/mcp-app-renderer.tsx";
import { UIResourceLoader } from "@/mcp-apps/resource-loader.ts";
import type {
  UIToolsCallResult,
  UIResourcesReadResult,
} from "@/mcp-apps/types.ts";

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

  // Get virtual MCP from chat context
  const { selectedVirtualMcp } = useChat();
  const virtualMcpId = selectedVirtualMcp?.id ?? null;

  // Look up tool's UI resource
  const { uiResource } = useToolUIResource(toolName, virtualMcpId);
  const uiResourceUri = uiResource?.uri;
  const toolConnectionId = uiResource?.connectionId ?? null;

  // Get MCP client for the tool's connection (to read resources)
  const mcpClient = useMCPClient({ connectionId: toolConnectionId });

  // MCP App state
  const [appHtml, setAppHtml] = useState<string | null>(null);
  const [appLoading, setAppLoading] = useState(false);
  const [appError, setAppError] = useState<string | null>(null);

  // Check if this tool has an MCP App and output is available
  const hasMCPApp = !!uiResourceUri && part.state === "output-available";

  // Create readResource function for MCP App
  const readResource = async (uri: string): Promise<UIResourcesReadResult> => {
    if (!mcpClient) {
      throw new Error("MCP client not available");
    }
    const result = await mcpClient.readResource({ uri });
    return {
      contents: result.contents.map((c) => ({
        uri: c.uri,
        mimeType: c.mimeType,
        text: "text" in c ? (c.text as string) : undefined,
        blob: "blob" in c ? (c.blob as string) : undefined,
      })),
    };
  };

  // Create callTool function for MCP App
  const callTool = async (
    name: string,
    args: Record<string, unknown>,
  ): Promise<UIToolsCallResult> => {
    if (!mcpClient) {
      throw new Error("MCP client not available");
    }
    const result = await mcpClient.callTool({ name, arguments: args });
    return {
      content: result.content.map((c) => ({
        type: c.type as "text" | "image" | "resource",
        text: "text" in c ? (c.text as string) : undefined,
        data: "data" in c ? (c.data as string) : undefined,
        mimeType: "mimeType" in c ? (c.mimeType as string) : undefined,
        uri: "uri" in c ? (c.uri as string) : undefined,
      })),
      isError: result.isError,
    };
  };

  // Load the MCP App HTML when output is available
  const loadMCPApp = async () => {
    if (!uiResourceUri || !mcpClient || appHtml || appLoading) return;

    setAppLoading(true);
    setAppError(null);

    try {
      const loader = new UIResourceLoader();
      const content = await loader.load(uiResourceUri, async (uri) => {
        const result = await readResource(uri);
        return { contents: result.contents };
      });
      setAppHtml(content.html);
    } catch (err) {
      console.error("Failed to load MCP App:", err);
      setAppError(err instanceof Error ? err.message : "Failed to load app");
    } finally {
      setAppLoading(false);
    }
  };

  // Trigger app load when conditions are met
  if (hasMCPApp && mcpClient && !appHtml && !appLoading && !appError) {
    loadMCPApp();
  }

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
      {hasMCPApp && appHtml && mcpClient && toolConnectionId && (
        <MCPAppRenderer
          html={appHtml}
          uri={uiResourceUri!}
          connectionId={toolConnectionId}
          toolName={toolName}
          toolInput={part.input}
          toolResult={part.output}
          callTool={callTool}
          readResource={readResource}
          minHeight={150}
          maxHeight={400}
          className="border border-border rounded-lg"
        />
      )}
      {hasMCPApp && appLoading && (
        <div className="flex items-center justify-center h-32 border border-border rounded-lg">
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="size-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Loading app...</span>
          </div>
        </div>
      )}
      {hasMCPApp && appError && (
        <div className="flex items-center justify-center h-32 border border-destructive/20 rounded-lg bg-destructive/10">
          <span className="text-sm text-destructive">{appError}</span>
        </div>
      )}
    </div>
  );
}
