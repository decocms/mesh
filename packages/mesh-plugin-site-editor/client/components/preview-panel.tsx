/**
 * Preview Panel Component
 *
 * Renders a full-size iframe pointing to the user's running local dev server.
 * When no preview URL is configured, shows a form to enter the dev server URL
 * (e.g., http://localhost:5173 or a deco link tunnel URL).
 *
 * The URL is persisted in connection metadata so it survives page reloads.
 */

import { useState } from "react";
import { useTunnelUrl } from "../lib/use-tunnel-url";
import { useIframeBridge } from "../lib/use-iframe-bridge";
import { VIEWPORTS, type ViewportKey } from "./viewport-toggle";
import type { Page } from "../lib/page-api";
import { Button } from "@deco/ui/components/button.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { Globe02, Loading01, LinkExternal01 } from "@untitledui/icons";

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
  const { url, isLoading, setPreviewUrl, isSaving } = useTunnelUrl();
  const { setIframeRef } = useIframeBridge({
    page,
    selectedBlockId,
    onBlockClicked,
  });
  const [inputUrl, setInputUrl] = useState("http://localhost:5173");

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
      <div className="flex flex-col items-center justify-center h-full gap-6 text-muted-foreground px-8">
        <Globe02 size={48} className="text-muted-foreground/50" />
        <div className="text-center">
          <p className="text-lg font-medium text-foreground mb-1">
            Connect your dev server
          </p>
          <p className="text-sm">
            Enter your local dev server URL to see a live preview
          </p>
        </div>
        <form
          className="flex items-center gap-2 w-full max-w-md"
          onSubmit={(e) => {
            e.preventDefault();
            if (inputUrl.trim()) {
              setPreviewUrl(inputUrl.trim());
            }
          }}
        >
          <Input
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            placeholder="http://localhost:5173"
            className="flex-1"
          />
          <Button type="submit" disabled={!inputUrl.trim() || isSaving}>
            {isSaving ? (
              <Loading01 size={14} className="animate-spin mr-1" />
            ) : (
              <LinkExternal01 size={14} className="mr-1" />
            )}
            Connect
          </Button>
        </form>
        <p className="text-xs text-muted-foreground/70">
          Or use a tunnel URL from{" "}
          <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">
            deco link
          </code>
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
