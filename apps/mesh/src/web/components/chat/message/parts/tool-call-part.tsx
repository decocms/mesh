import {
  AlertCircle,
  Terminal,
  ChevronRight,
  Atom02,
  LayersTwo01,
} from "@untitledui/icons";
import { cn } from "@deco/ui/lib/utils.ts";
import type { DynamicToolUIPart, ToolUIPart } from "ai";
import { ToolOutputRenderer } from "./tool-outputs/tool-output-renderer.tsx";
import { useState } from "react";
import { MonacoCodeEditor } from "../../../details/workflow/components/monaco-editor.tsx";
import { useDeveloperMode } from "@/web/hooks/use-developer-mode.ts";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@deco/ui/components/collapsible.tsx";
import { MCPAppRenderer } from "@/mcp-apps/mcp-app-renderer.tsx";
import { UIResourceLoader } from "@/mcp-apps/resource-loader.ts";
import type {
  UIToolsCallResult,
  UIResourcesReadResult,
} from "@/mcp-apps/types.ts";
import { useToolUIResource } from "@/mcp-apps/use-tool-ui-resource.ts";
import { useMCPClient } from "@decocms/mesh-sdk";
import { useChat } from "../../context.tsx";

interface ToolCallPartProps {
  part: ToolUIPart | DynamicToolUIPart;
  id: string;
  isFirstInSequence?: boolean;
  isLastInSequence?: boolean;
  hasNextToolCall?: boolean;
}

/**
 * Convert a tool name to a friendly display name
 * Converts SCREAMING_SNAKE_CASE or snake_case to Title Case
 */
function getFriendlyToolName(toolName: string): string {
  return toolName
    .split(/[_-]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function ToolCallPart({
  part,
  isFirstInSequence = false,
  isLastInSequence = false,
  hasNextToolCall = false,
}: ToolCallPartProps) {
  const { state } = part;
  const toolName =
    "toolName" in part ? part.toolName : part.type.replace("tool-", "");
  const friendlyName = getFriendlyToolName(toolName);
  const [isExpanded, setIsExpanded] = useState(false);
  const [developerMode] = useDeveloperMode();

  // Get virtual MCP from chat context
  const { selectedVirtualMcp } = useChat();
  const virtualMcpId = selectedVirtualMcp?.id ?? null;

  // Look up tool's UI resource
  const { uiResource } = useToolUIResource(toolName, virtualMcpId);
  const uiResourceUri = uiResource?.uri;
  const toolConnectionId = uiResource?.connectionId;

  // Get MCP client for the tool's connection (to read resources)
  const { data: mcpClient } = useMCPClient({
    connectionId: toolConnectionId,
  });

  // MCP App state
  const [appHtml, setAppHtml] = useState<string | null>(null);
  const [appLoading, setAppLoading] = useState(false);
  const [appError, setAppError] = useState<string | null>(null);

  // Check if this tool has an MCP App and output is available
  const hasMCPApp = !!uiResourceUri && state === "output-available";

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

  const showInput =
    (state === "input-streaming" ||
      state === "input-available" ||
      state === "output-available") &&
    !!part.input;
  const showOutput = state === "output-available";
  const showError = state === "output-error";

  // Business user mode - simple inline text like Thinking indicator
  // But show MCP App if available
  if (!developerMode) {
    const isStreaming =
      state === "input-streaming" || state === "input-available";
    const isComplete = state === "output-available";
    const isError = state === "output-error";

    // Show MCP App in business mode when available
    if (hasMCPApp && appHtml && mcpClient && toolConnectionId) {
      return (
        <div
          className={cn(
            "flex flex-col gap-2 my-4",
            isFirstInSequence && "mt-2",
          )}
        >
          <div className="flex items-center gap-1.5 opacity-75">
            <LayersTwo01 className="size-4 text-primary shrink-0" />
            <span className="text-[15px] text-muted-foreground">
              {friendlyName}
            </span>
          </div>
          <MCPAppRenderer
            html={appHtml}
            uri={uiResourceUri!}
            connectionId={toolConnectionId!}
            toolName={toolName}
            toolInput={part.input}
            toolResult={part.output}
            callTool={callTool}
            readResource={readResource}
            minHeight={150}
            maxHeight={400}
            className="border border-border rounded-lg"
          />
        </div>
      );
    }

    // Show loading state for MCP App
    if (hasMCPApp && appLoading) {
      return (
        <div
          className={cn(
            "flex flex-col gap-2 my-4",
            isFirstInSequence && "mt-2",
          )}
        >
          <div className="flex items-center gap-1.5 opacity-75">
            <LayersTwo01 className="size-4 text-primary shrink-0 animate-pulse" />
            <span className="text-[15px] text-muted-foreground shimmer">
              Loading {friendlyName}...
            </span>
          </div>
        </div>
      );
    }

    return (
      <div
        className={cn(
          "flex items-center gap-1.5 py-2 opacity-75 relative",
          isFirstInSequence && "mt-2",
          isLastInSequence && "mb-2",
        )}
      >
        <div className="relative shrink-0 flex items-center">
          {hasMCPApp ? (
            <LayersTwo01 className="size-4 text-primary shrink-0" />
          ) : (
            <Atom02 className="size-4 text-muted-foreground shrink-0" />
          )}
          {hasNextToolCall && (
            <div
              className="absolute left-1/2 top-full w-px bg-border -translate-x-1/2"
              style={{ height: "calc(100% + 1rem)" }}
            />
          )}
        </div>
        <span className="text-[15px]">
          {isStreaming && (
            <>
              <span className="text-muted-foreground shimmer">Calling</span>{" "}
              <span className="text-muted-foreground/75 shimmer">
                {friendlyName}...
              </span>
            </>
          )}
          {isComplete && (
            <>
              <span className="text-muted-foreground">Called</span>{" "}
              <span className="text-muted-foreground/75">{friendlyName}</span>
            </>
          )}
          {isError && (
            <>
              <span className="text-destructive/90">Error calling</span>{" "}
              <span className="text-destructive/75">{friendlyName}</span>
            </>
          )}
        </span>
      </div>
    );
  }

  // Developer mode - expandable box with JSON details
  return (
    <div className="flex flex-col my-4 w-full min-w-0">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        {/* Header - always cheap to render */}
        <div className="border border-border/75 rounded-lg flex flex-col bg-background w-full min-w-0 overflow-hidden">
          <CollapsibleTrigger className="flex items-center gap-2 w-full cursor-pointer p-3 hover:bg-accent/50 transition-colors">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {state === "output-error" ? (
                <AlertCircle className="size-4 text-destructive shrink-0" />
              ) : (
                <Terminal
                  className={cn(
                    "size-4 text-muted-foreground shrink-0",
                    (state === "input-streaming" ||
                      state === "input-available") &&
                      "shimmer",
                  )}
                />
              )}
              <span
                className={cn(
                  "text-[15px] font-medium text-muted-foreground truncate",
                  state === "output-error" && "text-destructive/90",
                  (state === "input-streaming" ||
                    state === "input-available") &&
                    "shimmer",
                )}
              >
                {state === "input-streaming" &&
                  `Streaming ${toolName} arguments`}
                {state === "input-available" && `Calling ${toolName}`}
                {state === "output-available" && `Called ${toolName}`}
                {state === "output-error" && `Error calling ${toolName}`}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <ChevronRight
                className={cn(
                  "size-4 text-muted-foreground transition-transform duration-200",
                  isExpanded && "rotate-90",
                )}
              />
            </div>
          </CollapsibleTrigger>

          {/* Heavy content - animated expand/collapse */}
          <CollapsibleContent className="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden">
            <div className="flex ml-[7px] px-3 pb-3">
              <div className="w-4 relative shrink-0">
                <div className="absolute left-0 top-0 bottom-0 w-0.25 bg-border" />
              </div>

              <div className="flex flex-col gap-4 flex-1 min-w-0 pt-2">
                {showInput && (
                  <div className="flex flex-col gap-0.5">
                    <div className="px-1 h-5 flex items-center">
                      <span className="text-xs font-medium text-muted-foreground">
                        Input
                      </span>
                    </div>
                    <div className="border border-border rounded-lg p-2 h-full max-h-[200px]">
                      <MonacoCodeEditor
                        code={JSON.stringify(part.input, null, 2)}
                        language="json"
                        foldOnMount={true}
                        height="100%"
                        readOnly={true}
                      />
                    </div>
                  </div>
                )}

                {/* MCP App Output */}
                {hasMCPApp && appHtml && mcpClient && toolConnectionId && (
                  <div className="flex flex-col gap-0.5">
                    <div className="px-1 h-5 flex items-center gap-2">
                      <LayersTwo01 className="size-3.5 text-primary" />
                      <span className="text-xs font-medium text-muted-foreground">
                        Interactive App
                      </span>
                    </div>
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
                  </div>
                )}

                {/* MCP App Loading */}
                {hasMCPApp && appLoading && (
                  <div className="flex items-center justify-center h-32 border border-border rounded-lg">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <div className="size-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm">Loading app...</span>
                    </div>
                  </div>
                )}

                {/* MCP App Error */}
                {hasMCPApp && appError && (
                  <div className="flex items-center justify-center h-32 border border-destructive/20 rounded-lg bg-destructive/10">
                    <span className="text-sm text-destructive">{appError}</span>
                  </div>
                )}

                {/* Regular Output (shown if no MCP App or as fallback in developer mode) */}
                {showOutput && (!hasMCPApp || (developerMode && appHtml)) && (
                  <div className="flex flex-col gap-0.5">
                    <div className="px-1 h-5 flex items-center">
                      <span className="text-xs font-medium text-muted-foreground">
                        {hasMCPApp ? "Raw Output" : "Output"}
                      </span>
                    </div>
                    <div className="border border-border rounded-lg max-h-[200px] overflow-auto p-2 h-full">
                      <ToolOutputRenderer output={part.output} />
                    </div>
                  </div>
                )}

                {/* Error */}
                {showError && (
                  <div className="flex flex-col gap-0.5">
                    <div className="px-1 h-5 flex items-center">
                      <span className="text-xs font-medium text-destructive/90">
                        Error
                      </span>
                    </div>
                    <div className="border border-destructive/20 rounded-lg max-h-[200px] overflow-auto p-2 bg-destructive/10">
                      <pre className="text-xs font-mono text-destructive whitespace-pre-wrap wrap-break-word">
                        {"errorText" in part &&
                        typeof part.errorText === "string"
                          ? part.errorText
                          : "An unknown error occurred"}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </div>
  );
}
