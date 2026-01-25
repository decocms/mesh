/**
 * App Preview Dialog
 *
 * Dialog component for previewing MCP Apps in the connection detail page.
 * Shows the app in a sandboxed iframe with full interactive capabilities.
 */

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@deco/ui/components/dialog.tsx";
import { useState, useRef } from "react";
import { MCPAppRenderer } from "./mcp-app-renderer.tsx";
import type { UIResourcesReadResult, UIToolsCallResult } from "./types.ts";
import { UIResourceLoader, UIResourceLoadError } from "./resource-loader.ts";

// ============================================================================
// Types
// ============================================================================

export interface AppPreviewDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when the dialog should close */
  onOpenChange: (open: boolean) => void;
  /** The URI of the resource to preview */
  uri: string;
  /** The name of the resource */
  name?: string;
  /** Connection ID for the MCP server */
  connectionId: string;
  /** Function to read resources from the MCP server */
  readResource: (uri: string) => Promise<{
    contents: Array<{
      uri: string;
      mimeType?: string;
      text?: string;
      blob?: string;
    }>;
  }>;
  /** Function to call tools on the MCP server */
  callTool: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<UIToolsCallResult>;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Dialog for previewing MCP Apps
 *
 * Fetches the UI resource content and renders it in the MCPAppRenderer.
 */
/**
 * Component that triggers loading on mount (used to avoid render-time side effects)
 */
function LoadTrigger({ onLoad }: { onLoad: () => void }) {
  const loadedRef = useRef(false);
  if (!loadedRef.current) {
    loadedRef.current = true;
    queueMicrotask(onLoad);
  }
  return null;
}

export function AppPreviewDialog({
  open,
  onOpenChange,
  uri,
  name,
  connectionId,
  readResource,
  callTool,
}: AppPreviewDialogProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load resource content
  const loadResource = () => {
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const loader = new UIResourceLoader();
        const content = await loader.load(uri, readResource);
        setHtml(content.html);
      } catch (err) {
        console.error("Failed to load UI resource:", err);
        if (err instanceof UIResourceLoadError) {
          setError(err.message);
        } else {
          setError(
            err instanceof Error ? err.message : "Failed to load resource",
          );
        }
      } finally {
        setLoading(false);
      }
    })();
  };

  // Handle dialog close - resets state
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Reset state after close animation
      setTimeout(() => {
        setHtml(null);
        setError(null);
      }, 200);
    }
    onOpenChange(newOpen);
  };

  // Determine if we need to trigger a load
  const needsLoad = open && !html && !loading && !error;

  // Wrapper for readResource to match the expected interface
  const handleReadResource = async (
    resourceUri: string,
  ): Promise<UIResourcesReadResult> => {
    const result = await readResource(resourceUri);
    return { contents: result.contents };
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{name || uri}</DialogTitle>
        </DialogHeader>

        {/* Trigger load when dialog is open and content not loaded */}
        {needsLoad && <LoadTrigger onLoad={loadResource} />}

        <div className="flex-1 min-h-0 overflow-auto">
          {loading && (
            <div className="flex items-center justify-center h-64">
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="size-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                <span>Loading app...</span>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center h-64">
              <div className="text-destructive text-center">
                <p className="font-medium">Failed to load app</p>
                <p className="text-sm text-muted-foreground mt-1">{error}</p>
              </div>
            </div>
          )}

          {html && !loading && !error && (
            <MCPAppRenderer
              html={html}
              uri={uri}
              connectionId={connectionId}
              displayMode="fullscreen"
              minHeight={300}
              maxHeight={600}
              callTool={callTool}
              readResource={handleReadResource}
              className="border border-border"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
