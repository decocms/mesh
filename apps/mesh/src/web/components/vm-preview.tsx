import { useState, useRef, useEffect } from "react";
import {
  useProjectContext,
  useMCPClient,
  SELF_MCP_ALIAS_ID,
} from "@decocms/mesh-sdk";
import { useInsetContext } from "@/web/layouts/agent-shell-layout";
import {
  CursorClick01,
  LinkExternal01,
  Loading01,
  Monitor04,
  RefreshCw01,
  Stop,
  Terminal,
} from "@untitledui/icons";
import { Button } from "@deco/ui/components/button.tsx";
import {
  ViewModeToggle,
  type ViewModeOption,
} from "@deco/ui/components/view-mode-toggle.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import {
  VISUAL_EDITOR_SCRIPT,
  VisualEditorPayloadSchema,
  type VisualEditorPayload,
} from "./preview/visual-editor-script";
import { VisualEditorPrompt } from "./preview/visual-editor-prompt";

interface VmData {
  terminalUrl: string | null;
  previewUrl: string;
  vmId: string;
}

type ViewStatus = "idle" | "starting" | "running" | "error";
type PreviewViewMode = "preview" | "visual";

const VIEW_MODE_OPTIONS: [
  ViewModeOption<PreviewViewMode>,
  ViewModeOption<PreviewViewMode>,
] = [
  { value: "preview", icon: <Monitor04 size={14} /> },
  { value: "visual", icon: <CursorClick01 size={14} /> },
];

export function VmPreviewContent() {
  const { org } = useProjectContext();
  const inset = useInsetContext();
  const [status, setStatus] = useState<ViewStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [activeView, setActiveView] = useState<"terminal" | "preview">(
    "terminal",
  );
  const [previewReady, setPreviewReady] = useState(false);
  const vmDataRef = useRef<VmData | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startingRef = useRef(false);

  // Visual editor state
  const [viewMode, setViewMode] = useState<PreviewViewMode>("preview");
  const [visualElement, setVisualElement] =
    useState<VisualEditorPayload | null>(null);
  const previewIframeRef = useRef<HTMLIFrameElement>(null);

  // oxlint-disable-next-line ban-use-effect/ban-use-effect — postMessage listener requires DOM event subscription; no React 19 alternative
  useEffect(() => {
    const vmData = vmDataRef.current;
    if (status !== "running" || !vmData?.previewUrl) return;

    let allowedOrigin: string;
    try {
      allowedOrigin = new URL(vmData.previewUrl).origin;
    } catch {
      return; // Malformed URL — skip listener setup
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
  }, [status]);

  const injectVisualEditor = () => {
    const win = previewIframeRef.current?.contentWindow;
    if (!win) return;
    // Send activation message to the bootstrap script injected by the
    // VM's iframe proxy. The bootstrap listens for this message and evals
    // the visual editor script. This works cross-origin since postMessage
    // doesn't require same-origin access.
    win.postMessage(
      { type: "visual-editor::activate", script: VISUAL_EDITOR_SCRIPT },
      "*",
    );
  };

  const handleViewModeChange = (mode: PreviewViewMode) => {
    setViewMode(mode);
    setVisualElement(null);
    if (mode === "visual") {
      injectVisualEditor();
    }
  };

  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  const handleStart = async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setStatus("starting");
    setErrorMsg("");
    setPreviewReady(false);
    setActiveView("terminal");

    try {
      if (!inset?.entity) throw new Error("No virtual MCP context");
      const result = await client.callTool({
        name: "VM_START",
        arguments: { virtualMcpId: inset.entity.id },
      });

      // Check for MCP tool error (content[0].text starts with "Error:")
      const content = (result as { content?: Array<{ text?: string }> })
        .content;
      if (content?.[0]?.text?.startsWith("Error:")) {
        throw new Error(content[0].text);
      }

      const payload =
        (result as { structuredContent?: unknown }).structuredContent ?? result;
      const data = payload as VmData;

      if (!data.previewUrl || !data.vmId) {
        throw new Error("Invalid VM response — missing URLs");
      }

      vmDataRef.current = data;
      setStatus("running");

      // Start polling for preview readiness
      // Use an image load trick — try loading favicon or a small resource
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => {
        const img = new Image();
        img.onload = () => {
          setPreviewReady(true);
          setActiveView("preview");
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        };
        // Try to load the page as an image — will fail but if the server
        // responds at all, we know it's up. Use a timestamp to bust cache.
        img.src = `${data.previewUrl}/favicon.ico?_t=${Date.now()}`;
      }, 5000);
    } catch (error) {
      setStatus("error");
      setErrorMsg(
        error instanceof Error ? error.message : "Failed to start VM",
      );
    } finally {
      startingRef.current = false;
    }
  };

  const handleStop = async () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    const virtualMcpId = inset?.entity?.id;
    vmDataRef.current = null;
    setStatus("idle");
    setPreviewReady(false);
    setVisualElement(null);
    setViewMode("preview");

    if (virtualMcpId) {
      try {
        await client.callTool({
          name: "VM_STOP",
          arguments: { virtualMcpId },
        });
      } catch {
        // Best effort
      }
    }
  };

  const handleOpenPreview = () => {
    setPreviewReady(true);
    setActiveView("preview");
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  if (status === "idle") {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full gap-4">
        <Monitor04 size={48} className="text-muted-foreground/40" />
        <h3 className="text-lg font-medium">Preview</h3>
        <p className="text-sm text-muted-foreground text-center max-w-sm">
          Start a development server from your connected GitHub repository.
        </p>
        <Button onClick={handleStart}>Start Preview</Button>
      </div>
    );
  }

  if (status === "starting") {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full gap-4">
        <Loading01 size={24} className="animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Creating VM and starting dev server...
        </p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full gap-4">
        <p className="text-sm text-destructive">{errorMsg}</p>
        <Button variant="outline" onClick={handleStart}>
          Retry
        </Button>
      </div>
    );
  }

  const vmData = vmDataRef.current;
  if (!vmData) return null;

  const hasTerminal = !!vmData.terminalUrl;

  return (
    <div className="flex flex-col w-full h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <ViewModeToggle
          value={viewMode}
          onValueChange={handleViewModeChange}
          options={VIEW_MODE_OPTIONS}
          size="sm"
        />
        {hasTerminal && (
          <button
            type="button"
            onClick={() => setActiveView("terminal")}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors shrink-0",
              activeView === "terminal"
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Terminal size={14} />
            Terminal
          </button>
        )}
        <div className="flex items-center gap-1 flex-1 min-w-0 rounded-md border border-border bg-muted/40 px-2 py-1">
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 h-5 w-5 p-0"
            onClick={() => {
              if (previewIframeRef.current) {
                previewIframeRef.current.src = previewIframeRef.current.src;
              }
            }}
          >
            <RefreshCw01 size={12} />
          </Button>
          <span className="text-xs text-muted-foreground font-mono truncate flex-1">
            {vmData.previewUrl}
          </span>
          {!previewReady && (
            <Loading01
              size={10}
              className="animate-spin shrink-0 text-muted-foreground"
            />
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0"
          onClick={() => window.open(vmData.previewUrl, "_blank", "noopener")}
        >
          <LinkExternal01 size={14} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0"
          onClick={handleStop}
        >
          <Stop size={14} />
        </Button>
      </div>

      <div className="flex-1 relative">
        {hasTerminal && (
          <iframe
            src={vmData.terminalUrl ?? undefined}
            className={cn(
              "absolute inset-0 w-full h-full border-0",
              activeView !== "terminal" && "hidden",
            )}
            title="VM Terminal"
            allow="clipboard-read; clipboard-write"
          />
        )}
        {!previewReady && !hasTerminal && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <Loading01
              size={20}
              className="animate-spin text-muted-foreground"
            />
            <p className="text-sm text-muted-foreground">
              Installing dependencies and starting dev server...
            </p>
            <Button variant="outline" size="sm" onClick={handleOpenPreview}>
              Open Preview
            </Button>
          </div>
        )}
        {(previewReady || activeView === "preview") && (
          <div className="absolute inset-0">
            {/* Visual mode hint */}
            {viewMode === "visual" && !visualElement && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 rounded-full border border-violet-400/40 bg-violet-500/90 px-3 py-1 text-xs font-medium text-white shadow-md backdrop-blur-sm pointer-events-none select-none">
                <CursorClick01 size={12} />
                Click any element to ask the AI
              </div>
            )}

            {/* Floating prompt on element click */}
            {viewMode === "visual" && visualElement && (
              <VisualEditorPrompt
                element={visualElement}
                onDismiss={() => setVisualElement(null)}
              />
            )}

            <iframe
              ref={previewIframeRef}
              src={vmData.previewUrl}
              className={cn(
                "w-full h-full border-0",
                activeView !== "preview" && "hidden",
              )}
              title="Dev Server Preview"
              onLoad={() => {
                if (viewMode === "visual") {
                  injectVisualEditor();
                }
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
