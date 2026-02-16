/**
 * Preview Panel Component
 *
 * Renders a full-size iframe pointing to the user's running local dev server.
 * When no preview URL is configured, shows a form to enter the dev server URL
 * (e.g., http://localhost:5173 or a deco link tunnel URL).
 *
 * Includes:
 * - Edit/interact mode toggle
 * - URL bar showing current preview path
 * - External navigation overlay (when user navigates away from the site)
 * - Disconnect overlay (when iframe bridge loses connection)
 *
 * The URL is persisted in connection metadata so it survives page reloads.
 */

import { useRef, useState } from "react";
import { useTunnelUrl } from "../lib/use-tunnel-url";
import type { HoverRect } from "../lib/use-iframe-bridge";
import { VIEWPORTS, type ViewportKey } from "./viewport-toggle";
import { ModeToggle } from "./mode-toggle";
import { Button } from "@deco/ui/components/button.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { Globe02, Loading01, LinkExternal01 } from "@untitledui/icons";
import { ExternalLink } from "lucide-react";

interface PreviewPanelProps {
  /** Page path to preview (e.g., "/", "/about") */
  path?: string;
  /** Current viewport size */
  viewport: ViewportKey;
  /** Ref callback to attach to the iframe element */
  setIframeRef: (el: HTMLIFrameElement | null) => void;
  /** Whether the iframe bridge is ready */
  ready: boolean;
  /** Current editor mode */
  mode: "edit" | "interact";
  /** Callback when mode changes */
  onModeChange: (mode: "edit" | "interact") => void;
  /** External navigation URL (null when on the site) */
  externalNav: string | null;
  /** Callback to return from external navigation */
  onReturnFromExternal: () => void;
  /** Whether the iframe bridge is disconnected */
  disconnected: boolean;
  /** Callback to reconnect the iframe */
  reconnect: () => void;
  /** Hover rect from iframe for editor-side overlay */
  hoverRect: HoverRect | null;
  /** Clear hover when mouse leaves iframe area */
  onIframeMouseLeave: () => void;
}

export function PreviewPanel({
  path = "/",
  viewport,
  setIframeRef,
  ready: _ready,
  mode,
  onModeChange,
  externalNav,
  onReturnFromExternal,
  disconnected,
  reconnect,
  hoverRect,
  onIframeMouseLeave,
}: PreviewPanelProps) {
  const iframeContainerRef = useRef<HTMLDivElement>(null);
  const { url, isLoading, setPreviewUrl, isSaving } = useTunnelUrl();
  const [inputUrl, setInputUrl] = useState("http://localhost:5173");
  const [editingUrl, setEditingUrl] = useState(false);
  const [editUrlValue, setEditUrlValue] = useState("");

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
  const displayUrl =
    previewUrl.length > 60 ? `${previewUrl.slice(0, 57)}...` : previewUrl;

  return (
    <div className="flex flex-col w-full h-full">
      {/* Toolbar: URL display + mode toggle */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-background gap-2">
        {editingUrl ? (
          <form
            className="flex-1 max-w-xs"
            onSubmit={(e) => {
              e.preventDefault();
              if (editUrlValue.trim()) {
                setPreviewUrl(editUrlValue.trim());
                setEditingUrl(false);
              }
            }}
          >
            <Input
              value={editUrlValue}
              onChange={(e) => setEditUrlValue(e.target.value)}
              className="h-6 text-xs font-mono"
              autoFocus
              onBlur={() => setEditingUrl(false)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setEditingUrl(false);
              }}
            />
          </form>
        ) : (
          <span
            className="text-xs text-muted-foreground truncate max-w-xs font-mono cursor-pointer hover:text-foreground"
            title={`${previewUrl} (click to edit)`}
            onClick={() => {
              setEditUrlValue(url ?? "");
              setEditingUrl(true);
            }}
          >
            {displayUrl}
          </span>
        )}
        <ModeToggle mode={mode} onChange={onModeChange} />
      </div>

      {/* Iframe container */}
      <div
        ref={iframeContainerRef}
        className="relative flex-1 flex justify-center bg-muted/30"
      >
        <div
          className="relative"
          style={{
            width: viewportWidth ? `${viewportWidth}px` : "100%",
            height: "100%",
          }}
          onMouseLeave={onIframeMouseLeave}
        >
          <iframe
            ref={setIframeRef}
            src={previewUrl}
            className="w-full h-full border-0 bg-white shadow-md"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            title="Site preview"
          />

          {/* Editor-side hover overlay — positioned on top of iframe */}
          {hoverRect && mode === "edit" && (
            <div
              className="pointer-events-none absolute z-[5] border-2 border-primary/40 bg-primary/5 transition-all duration-100 ease-out"
              style={{
                top: hoverRect.top,
                left: hoverRect.left,
                width: hoverRect.width,
                height: hoverRect.height,
              }}
            />
          )}
        </div>

        {/* External navigation overlay */}
        {externalNav && (
          <div className="absolute inset-0 bg-background/60 flex flex-col items-center justify-center gap-3 z-10">
            <ExternalLink size={32} className="text-muted-foreground" />
            <p className="text-sm font-medium">Navigated to external site</p>
            <p className="text-xs text-muted-foreground max-w-xs truncate">
              {externalNav}
            </p>
            <Button variant="outline" size="sm" onClick={onReturnFromExternal}>
              Return to editor
            </Button>
          </div>
        )}

        {/* Disconnect overlay */}
        {disconnected && !externalNav && (
          <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center gap-3 z-10">
            <Loading01 size={32} className="text-muted-foreground" />
            <p className="text-sm font-medium">Preview disconnected</p>
            <p className="text-xs text-muted-foreground">
              The dev server may have stopped
            </p>
            <Button variant="outline" size="sm" onClick={reconnect}>
              Reconnect
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default PreviewPanel;
