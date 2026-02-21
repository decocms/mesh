/**
 * MCP App Renderer Component
 *
 * React component that renders an MCP App in a sandboxed iframe.
 * Handles lifecycle, sizing, and cleanup.
 */

import { cn } from "@deco/ui/lib/utils.ts";
import { useRef, useState } from "react";
import { MCPAppModel, type MCPAppModelOptions } from "./mcp-app-model.ts";
import type {
  DisplayMode,
  UIMessageParams,
  UISizeChangedParams,
  UIToolsCallResult,
  UIResourcesReadResult,
} from "./types.ts";

// ============================================================================
// Types
// ============================================================================

export interface MCPAppRendererProps {
  /** The HTML content of the app */
  html: string;
  /** The URI of the app resource */
  uri: string;
  /** Connection ID for proxying tool calls */
  connectionId: string;
  /** Tool name that triggered this app */
  toolName?: string;
  /** Tool input arguments */
  toolInput?: unknown;
  /** Tool result */
  toolResult?: unknown;
  /** Display mode */
  displayMode?: DisplayMode;
  /** Minimum height in pixels */
  minHeight?: number;
  /** Maximum height in pixels */
  maxHeight?: number;
  /** Function to call tools */
  callTool: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<UIToolsCallResult>;
  /** Function to read resources */
  readResource: (uri: string) => Promise<UIResourcesReadResult>;
  /** Callback when app sends a message to add to conversation */
  onMessage?: (params: UIMessageParams) => void;
  /** Additional CSS class name */
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Renders an MCP App in a sandboxed iframe
 *
 * This component:
 * - Creates a sandboxed iframe with the prepared HTML
 * - Sets up the MCPAppModel for message handling
 * - Handles dynamic sizing based on app requests
 * - Cleans up resources on unmount
 */
export function MCPAppRenderer({
  html,
  uri,
  connectionId,
  toolName,
  toolInput,
  toolResult,
  displayMode = "inline",
  minHeight = 150,
  maxHeight = 600,
  callTool,
  readResource,
  onMessage,
  className,
}: MCPAppRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const modelRef = useRef<MCPAppModel | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevBoundsRef = useRef({ minHeight, maxHeight });
  const [height, setHeight] = useState(minHeight);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // React to minHeight/maxHeight prop changes (for expand/collapse without remount)
  // Always reset to minHeight when bounds change to ensure proper size transition
  if (
    prevBoundsRef.current.minHeight !== minHeight ||
    prevBoundsRef.current.maxHeight !== maxHeight
  ) {
    prevBoundsRef.current = { minHeight, maxHeight };
    setHeight(minHeight);
  }

  // Handle size change from the app
  const handleSizeChange = (params: UISizeChangedParams) => {
    const newHeight = Math.max(minHeight, Math.min(maxHeight, params.height));
    setHeight(newHeight);
  };

  // Handle message from the app
  const handleMessage = (params: UIMessageParams) => {
    onMessage?.(params);
  };

  // Set up the model when iframe is available
  const handleIframeRef = (iframe: HTMLIFrameElement | null) => {
    // Clean up previous interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Clean up previous model
    if (modelRef.current) {
      modelRef.current.dispose();
      modelRef.current = null;
    }

    if (!iframe) {
      return;
    }

    // Save ref for later access
    (iframeRef as React.MutableRefObject<HTMLIFrameElement | null>).current =
      iframe;

    try {
      // Create model options
      const options: MCPAppModelOptions = {
        html,
        uri,
        connectionId,
        toolName,
        toolInput,
        toolResult,
        displayMode,
        callTool,
        readResource,
        onSizeChange: handleSizeChange,
        onMessage: handleMessage,
      };

      // Create and attach model
      const model = new MCPAppModel(options);
      modelRef.current = model;
      model.attach(iframe);

      // Update loading state based on model state
      const checkState = () => {
        const state = model.getState();
        if (state === "ready") {
          setIsLoading(false);
          // Clear interval once ready
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        } else if (state === "error") {
          setIsLoading(false);
          setError("Failed to initialize MCP App");
          // Clear interval on error
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }
      };

      // Check state periodically until ready
      intervalRef.current = setInterval(checkState, 100);
    } catch (err) {
      console.error("Failed to create MCP App model:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      setIsLoading(false);
    }
  };

  // Get prepared HTML from model if available
  const preparedHtml = modelRef.current?.preparedHtml ?? html;

  if (error) {
    return (
      <div
        className={cn(
          "flex items-center justify-center p-4 text-destructive bg-destructive/10 rounded-lg",
          className,
        )}
      >
        <span className="text-sm">{error}</span>
      </div>
    );
  }

  return (
    <div
      className={cn("relative w-full overflow-hidden rounded-lg", className)}
      style={{ height: `${height}px` }}
    >
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="size-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Loading app...</span>
          </div>
        </div>
      )}
      <iframe
        ref={handleIframeRef}
        srcDoc={preparedHtml}
        sandbox="allow-scripts allow-forms"
        className={cn("w-full h-full border-0", isLoading && "invisible")}
        title={`MCP App: ${toolName ?? uri}`}
      />
    </div>
  );
}

// ============================================================================
// Exports
// ============================================================================

export { MCPAppModel } from "./mcp-app-model.ts";
export type { MCPAppModelOptions, MCPAppState } from "./mcp-app-model.ts";
