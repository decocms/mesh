/**
 * Preview Panel Component
 *
 * Renders a full-size iframe pointing to the user's running local dev server
 * via the tunnel URL created by `deco link`. When no tunnel URL is available,
 * shows a helpful empty state with instructions.
 *
 * This component fills its parent container (100% width and height).
 * Responsive viewport toggles will be added in Phase 3 (EDIT-04).
 */

import { useTunnelUrl } from "../lib/use-tunnel-url";

interface PreviewPanelProps {
  /** Page path to preview (e.g., "/", "/about") */
  path?: string;
}

export function PreviewPanel({ path = "/" }: PreviewPanelProps) {
  const { url, isLoading } = useTunnelUrl();

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

  return (
    <div className="relative w-full h-full">
      <iframe
        src={previewUrl}
        className="w-full h-full border-0"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        title="Site preview"
      />
    </div>
  );
}

export default PreviewPanel;
