/**
 * MCP App Loader Component
 *
 * A separate component for loading and rendering MCP Apps.
 * This component uses useMCPClient which requires Suspense,
 * so it must be rendered within a Suspense boundary.
 */

import { MCPAppRenderer } from "@/mcp-apps/mcp-app-renderer.tsx";
import { UIResourceLoader } from "@/mcp-apps/resource-loader.ts";
import {
  MCP_APP_DISPLAY_MODES,
  type UIToolsCallResult,
  type UIResourcesReadResult,
} from "@/mcp-apps/types.ts";
import { useMCPClient } from "@decocms/mesh-sdk";
import { useState, useRef } from "react";
import { LayersTwo01, Expand06, Minimize01 } from "@untitledui/icons";
import { cn } from "@deco/ui/lib/utils.ts";
import { Button } from "@deco/ui/components/button.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";

interface MCPAppLoaderProps {
  /** The UI resource URI */
  uiResourceUri: string;
  /** The connection ID to use for reading resources */
  connectionId: string;
  /** The organization ID */
  orgId: string;
  /** The tool name for display */
  toolName: string;
  /** Friendly display name for the tool */
  friendlyName: string;
  /** The tool's input */
  toolInput: unknown;
  /** The tool's output/result */
  toolResult: unknown;
  /** Minimum height for the app */
  minHeight?: number;
  /** Maximum height for the app */
  maxHeight?: number;
  /** Additional class name */
  className?: string;
  /** Whether in developer mode */
  developerMode?: boolean;
  /** Whether this is the first tool in a sequence */
  isFirstInSequence?: boolean;
}

export function MCPAppLoader({
  uiResourceUri,
  connectionId,
  orgId,
  toolName,
  friendlyName,
  toolInput,
  toolResult,
  minHeight = MCP_APP_DISPLAY_MODES.collapsed.minHeight,
  maxHeight = MCP_APP_DISPLAY_MODES.collapsed.maxHeight,
  className,
  developerMode = false,
  isFirstInSequence = false,
}: MCPAppLoaderProps) {
  // Get MCP client for reading resources - this uses Suspense
  const mcpClient = useMCPClient({
    connectionId,
    orgId,
  });

  // App state
  const [appHtml, setAppHtml] = useState<string | null>(null);
  const [appLoading, setAppLoading] = useState(false);
  const [appError, setAppError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Create readResource function for MCP App
  const readResource = async (uri: string): Promise<UIResourcesReadResult> => {
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
    const result = await mcpClient.callTool({ name, arguments: args });
    const content = result.content as Array<{
      type: string;
      text?: string;
      data?: string;
      mimeType?: string;
      uri?: string;
    }>;
    return {
      content: content.map((c) => ({
        type: c.type as "text" | "image" | "resource",
        text: c.text,
        data: c.data,
        mimeType: c.mimeType,
        uri: c.uri,
      })),
      isError: result.isError as boolean | undefined,
    };
  };

  // Track if we've started loading to avoid duplicate loads
  const loadStartedRef = useRef(false);

  // Schedule MCP App HTML load (deferred to avoid render-time state updates)
  const shouldLoad =
    !loadStartedRef.current && !appHtml && !appLoading && !appError;
  if (shouldLoad) {
    loadStartedRef.current = true;
    // Defer state updates to after render using queueMicrotask
    queueMicrotask(() => {
      setAppLoading(true);
      (async () => {
        try {
          const loader = new UIResourceLoader();
          const content = await loader.load(uiResourceUri, async (uri) => {
            const result = await readResource(uri);
            return { contents: result.contents };
          });
          setAppHtml(content.html);
        } catch (err) {
          console.error("Failed to load MCP App:", err);
          setAppError(
            err instanceof Error ? err.message : "Failed to load app",
          );
        } finally {
          setAppLoading(false);
        }
      })();
    });
  }

  // For expanded mode, we'll use inline styles for viewport-based height

  // Expand toggle button
  const ExpandButton = () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 shrink-0"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? (
            <Minimize01 className="size-3.5" />
          ) : (
            <Expand06 className="size-3.5" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">
        {isExpanded ? "Collapse" : "Expand"}
      </TooltipContent>
    </Tooltip>
  );

  // Loading state
  if (appLoading) {
    if (developerMode) {
      return (
        <div className="flex items-center justify-center h-32 border border-border rounded-lg">
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="size-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Loading app...</span>
          </div>
        </div>
      );
    }
    return (
      <div
        className={cn("flex flex-col gap-2 my-4", isFirstInSequence && "mt-2")}
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

  // Error state
  if (appError) {
    return (
      <div className="flex items-center justify-center h-32 border border-destructive/20 rounded-lg bg-destructive/10">
        <span className="text-sm text-destructive">{appError}</span>
      </div>
    );
  }

  // Loaded - render the app
  if (appHtml) {
    // Compute heights based on expanded state
    const currentMinHeight = isExpanded
      ? MCP_APP_DISPLAY_MODES.expanded.minHeight
      : minHeight;
    const currentMaxHeight = isExpanded
      ? MCP_APP_DISPLAY_MODES.expanded.maxHeight
      : maxHeight;

    // Unified render path - same structure, different props
    if (developerMode) {
      return (
        <div className="flex flex-col gap-0.5">
          <div className="px-1 h-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <LayersTwo01 className="size-3.5 text-primary" />
              <span className="text-xs font-medium text-muted-foreground">
                Interactive App
              </span>
            </div>
            <ExpandButton />
          </div>
          <MCPAppRenderer
            html={appHtml}
            uri={uiResourceUri}
            connectionId={connectionId}
            toolName={toolName}
            toolInput={toolInput}
            toolResult={toolResult}
            callTool={callTool}
            readResource={readResource}
            minHeight={currentMinHeight}
            maxHeight={currentMaxHeight}
            className={cn("border border-border rounded-lg", className)}
          />
        </div>
      );
    }

    return (
      <div
        className={cn("flex flex-col gap-2 my-4", isFirstInSequence && "mt-2")}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 opacity-75">
            <LayersTwo01 className="size-4 text-primary shrink-0" />
            <span className="text-[15px] text-muted-foreground">
              {friendlyName}
            </span>
          </div>
          <ExpandButton />
        </div>
        <MCPAppRenderer
          html={appHtml}
          uri={uiResourceUri}
          connectionId={connectionId}
          toolName={toolName}
          toolInput={toolInput}
          toolResult={toolResult}
          callTool={callTool}
          readResource={readResource}
          minHeight={currentMinHeight}
          maxHeight={currentMaxHeight}
          className={cn("border border-border rounded-lg", className)}
        />
      </div>
    );
  }

  return null;
}
