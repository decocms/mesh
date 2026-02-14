/**
 * Preview Panel Component
 *
 * Renders a full-size iframe pointing to the user's running local dev server
 * via the tunnel URL. Communicates with the iframe via a typed postMessage
 * protocol (deco:ready handshake, deco:page-config, deco:select-block).
 *
 * Supports viewport width switching for responsive preview.
 */

import { useTunnelUrl } from "../lib/use-tunnel-url";
import { useIframeBridge } from "../lib/use-iframe-bridge";
import { VIEWPORTS, type ViewportKey } from "./viewport-toggle";
import type { Page } from "../lib/page-api";

interface PreviewPanelProps {
  /** Page path to preview (e.g., "/", "/about") */
  path?: string;
  /** Current page data to send to the iframe */
  page: Page | null;
  /** Currently selected block ID for highlighting */
  selectedBlockId: string | null;
  /** Current viewport size */
  viewport: ViewportKey;
  /** Called when user clicks a block in the preview */
  onBlockClicked: (blockId: string) => void;
}

export function PreviewPanel({
  path = "/",
  page,
  selectedBlockId,
  viewport,
  onBlockClicked,
}: PreviewPanelProps) {
  const { url, isLoading } = useTunnelUrl();
  const { setIframeRef } = useIframeBridge({
    page,
    selectedBlockId,
    onBlockClicked,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-sm text-muted-foreground">
          Loading preview...
        </span>
      </div>
    );
  }

  if (!url) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
        <p className="text-lg font-medium">No preview available</p>
        <p className="text-sm">
          Start your dev server and run{" "}
          <code className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">
            deco link
          </code>{" "}
          to see a live preview
        </p>
      </div>
    );
  }

  const previewUrl = path !== "/" ? `${url}${path}` : url;
  const viewportWidth = VIEWPORTS[viewport]?.width;

  return (
    <div className="relative w-full h-full flex justify-center bg-muted/30">
      <iframe
        ref={setIframeRef}
        src={previewUrl}
        style={{ width: viewportWidth ? `${viewportWidth}px` : "100%" }}
        className="h-full border-0 bg-white shadow-md transition-[width] duration-300"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        title="Site preview"
      />
    </div>
  );
}

export default PreviewPanel;
