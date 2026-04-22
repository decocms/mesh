import { useState, useRef, useEffect } from "react";
import { useInsetContext } from "@/web/layouts/agent-shell-layout";
import { authClient } from "@/web/lib/auth-client";
import { useToggleEnvPanel } from "@/web/hooks/use-toggle-env-panel";
import {
  ArrowLeft,
  ArrowRight,
  CursorClick01,
  DotsHorizontal,
  LinkExternal01,
  Monitor04,
  RefreshCw01,
  Server01,
} from "@untitledui/icons";
import { Button } from "@deco/ui/components/button.tsx";
import {
  ViewModeToggle,
  type ViewModeOption,
} from "@deco/ui/components/view-mode-toggle.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@deco/ui/components/dropdown-menu.tsx";
import {
  VISUAL_EDITOR_SCRIPT,
  VisualEditorPayloadSchema,
  type VisualEditorPayload,
} from "./visual-editor-script";
import { VisualEditorPrompt } from "./visual-editor-prompt";
import { useVmEvents } from "../hooks/use-vm-events";
import { VmSuspendedState } from "../vm-suspended-state";

type PreviewViewMode = "preview" | "visual";

const VIEW_MODE_OPTIONS: [
  ViewModeOption<PreviewViewMode>,
  ViewModeOption<PreviewViewMode>,
] = [
  {
    value: "preview",
    icon: <Monitor04 size={14} />,
    tooltip: "Interactive",
  },
  {
    value: "visual",
    icon: <CursorClick01 size={14} />,
    tooltip: "Visual Editor",
  },
];

export function PreviewContent() {
  const inset = useInsetContext();
  const { data: session } = authClient.useSession();
  const { openEnv } = useToggleEnvPanel();

  // Visual editor state
  const [viewMode, setViewMode] = useState<PreviewViewMode>("preview");
  const [visualElement, setVisualElement] =
    useState<VisualEditorPayload | null>(null);
  const previewIframeRef = useRef<HTMLIFrameElement>(null);

  // Read VM data from entity metadata
  const userId = session?.user?.id;
  const metadata = inset?.entity?.metadata as
    | {
        activeVms?: Record<
          string,
          { previewUrl: string; vmId: string; terminalUrl: string | null }
        >;
      }
    | undefined;
  const vmEntry = userId ? metadata?.activeVms?.[userId] : undefined;
  const previewUrl = vmEntry?.previewUrl ?? null;

  const vmEvents = useVmEvents(previewUrl, null);
  const suspended = vmEvents.suspended;
  const previewLabel = (() => {
    if (!previewUrl) return "No server running";
    try {
      const url = new URL(previewUrl);
      return `${url.host}${url.pathname === "/" ? "" : url.pathname}`;
    } catch {
      return previewUrl;
    }
  })();

  // oxlint-disable-next-line ban-use-effect/ban-use-effect — postMessage listener requires DOM event subscription; no React 19 alternative
  useEffect(() => {
    if (!previewUrl) return;

    let allowedOrigin: string;
    try {
      allowedOrigin = new URL(previewUrl).origin;
    } catch {
      return;
    }

    const handler = (e: MessageEvent) => {
      if (e.origin !== allowedOrigin) return;
      if (e.data?.type !== "visual-editor::element-clicked") return;
      const result = VisualEditorPayloadSchema.safeParse(e.data.payload);
      if (result.success) {
        setVisualElement(result.data);
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [previewUrl]);

  const injectVisualEditor = () => {
    const win = previewIframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage(
      { type: "visual-editor::activate", script: VISUAL_EDITOR_SCRIPT },
      "*",
    );
  };

  const deactivateVisualEditor = () => {
    const win = previewIframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ type: "visual-editor::deactivate" }, "*");
  };

  const handleViewModeChange = (mode: PreviewViewMode) => {
    setViewMode(mode);
    setVisualElement(null);
    if (mode === "visual") {
      injectVisualEditor();
    } else {
      deactivateVisualEditor();
    }
  };

  const handleRefresh = () => {
    if (!previewIframeRef.current) return;
    const iframe = previewIframeRef.current;
    // biome-ignore lint/correctness/noSelfAssign: reloads the iframe
    // oxlint-disable-next-line no-self-assign
    iframe.src = iframe.src;
  };

  const handleHardReload = () => {
    if (!previewIframeRef.current || !previewUrl) return;
    const sep = previewUrl.includes("?") ? "&" : "?";
    previewIframeRef.current.src = `${previewUrl}${sep}_r=${Date.now()}`;
  };

  const handleCopyUrl = () => {
    const url =
      previewIframeRef.current?.contentWindow?.location?.href ?? previewUrl;
    if (url) navigator.clipboard.writeText(url);
  };

  return (
    <div className="group flex h-full w-full flex-col overflow-hidden bg-background">
      {previewUrl && (
        <div className="flex h-12 shrink-0 items-center gap-4 border-b border-border/60 px-3 md:px-4">
          {/* Group 1: view mode toggle */}
          <ViewModeToggle
            value={viewMode}
            onValueChange={handleViewModeChange}
            options={VIEW_MODE_OPTIONS}
            size="sm"
            className="shrink-0 bg-foreground/[0.045]"
          />

          {/* Group 2: nav + url */}
          <div className="flex min-w-0 flex-1 items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    previewIframeRef.current?.contentWindow?.history.back()
                  }
                >
                  <ArrowLeft size={14} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Back</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    previewIframeRef.current?.contentWindow?.history.forward()
                  }
                >
                  <ArrowRight size={14} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Forward</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={handleRefresh}>
                  <RefreshCw01 size={14} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Refresh</TooltipContent>
            </Tooltip>

            <div className="flex h-8 min-w-0 flex-1 items-center rounded-md bg-background px-2 transition-colors duration-200 hover:bg-accent">
              <span className="min-w-0 flex-1 truncate text-[12px] text-foreground/88">
                {previewLabel}
              </span>
            </div>
          </div>

          {/* Group 3: more actions + open in new tab */}
          <div className="flex shrink-0 items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => window.open(previewUrl, "_blank", "noopener")}
                >
                  <LinkExternal01 size={14} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Open in new tab</TooltipContent>
            </Tooltip>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <DotsHorizontal size={14} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleHardReload}>
                  Hard Reload
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleCopyUrl}>
                  Copy Current URL
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() =>
                    previewIframeRef.current?.contentWindow?.history.go(
                      -(
                        previewIframeRef.current?.contentWindow?.history
                          .length ?? 0
                      ),
                    )
                  }
                >
                  Clear Browsing History
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    fetch(`${previewUrl}/_decopilot_vm/clear-cookies`, {
                      method: "POST",
                    })
                  }
                >
                  Clear Cookies
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    fetch(`${previewUrl}/_decopilot_vm/clear-cache`, {
                      method: "POST",
                    })
                  }
                >
                  Clear Cache
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}

      <div className="relative flex-1 overflow-hidden bg-[radial-gradient(circle_at_top,rgba(127,127,127,0.08),transparent_42%)]">
        {!previewUrl && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-background">
            <Monitor04 size={48} className="text-muted-foreground/40" />
            <h3 className="text-lg font-medium">Preview</h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Start the development server to see a live preview
            </p>
            <Button onClick={openEnv}>
              <Server01 size={14} />
              Start Server
            </Button>
          </div>
        )}

        {suspended && (
          <div className="absolute inset-0 z-30 bg-background/80 backdrop-blur-sm">
            <VmSuspendedState onResume={openEnv} />
          </div>
        )}

        {viewMode === "visual" && !visualElement && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 rounded-full border border-violet-400/40 bg-violet-500/90 px-3 py-1 text-xs font-medium text-white shadow-md backdrop-blur-sm pointer-events-none select-none">
            <CursorClick01 size={12} />
            Click any element to ask the AI
          </div>
        )}
        {viewMode === "visual" && visualElement && (
          <VisualEditorPrompt
            element={visualElement}
            onDismiss={() => setVisualElement(null)}
          />
        )}
        {previewUrl && (
          <iframe
            ref={previewIframeRef}
            src={previewUrl}
            className="h-full w-full border-0 bg-white"
            title="Dev Server Preview"
            onLoad={() => {
              if (viewMode === "visual") {
                injectVisualEditor();
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
