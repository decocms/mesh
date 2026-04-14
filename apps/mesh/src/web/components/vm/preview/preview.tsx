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
  VISUAL_EDITOR_SCRIPT,
  VisualEditorPayloadSchema,
  type VisualEditorPayload,
} from "./visual-editor-script";
import { VisualEditorPrompt } from "./visual-editor-prompt";
import { useVmEvents } from "../hooks/use-vm-events";
import { LiveTimer } from "../../live-timer";

interface VmData {
  terminalUrl: string | null;
  previewUrl: string;
  vmId: string;
  isNewVm: boolean;
}

type ViewStatus =
  | "idle"
  | "creating"
  | "running"
  | "suspended"
  | "stopping"
  | "error";
type PreviewViewMode = "preview" | "visual";

const VIEW_MODE_OPTIONS: [
  ViewModeOption<PreviewViewMode>,
  ViewModeOption<PreviewViewMode>,
] = [
  { value: "preview", icon: <Monitor04 size={14} />, tooltip: "Interactive" },
  {
    value: "visual",
    icon: <CursorClick01 size={14} />,
    tooltip: "Visual Editor",
  },
];

export function PreviewContent() {
  const { org } = useProjectContext();
  const inset = useInsetContext();
  const [status, setStatus] = useState<ViewStatus>("idle");
  const [statusLabel, setStatusLabel] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [actionError, setActionError] = useState("");
  const vmDataRef = useRef<VmData | null>(null);
  const startingRef = useRef(false);
  const startedAtRef = useRef<number>(Date.now());

  // Visual editor state
  const [viewMode, setViewMode] = useState<PreviewViewMode>("preview");
  const [visualElement, setVisualElement] =
    useState<VisualEditorPayload | null>(null);
  const previewIframeRef = useRef<HTMLIFrameElement>(null);

  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  const vmEvents = useVmEvents(
    status === "running" ? (vmDataRef.current?.previewUrl ?? null) : null,
    null,
  );

  const hasHtmlPreview = vmEvents.status.htmlSupport;

  const callTool = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args });
    const content = (result as { content?: Array<{ text?: string }> }).content;
    if (content?.[0]?.text?.startsWith("Error:")) {
      throw new Error(content[0].text);
    }
    return (
      (result as { structuredContent?: unknown }).structuredContent ?? result
    );
  };

  const handleStart = async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    startedAtRef.current = Date.now();
    setStatus("creating");
    setStatusLabel("Connecting...");
    setErrorMsg("");

    try {
      if (!inset?.entity) throw new Error("No virtual MCP context");
      const data = (await callTool("VM_START", {
        virtualMcpId: inset.entity.id,
      })) as VmData;

      if (!data.previewUrl || !data.vmId) {
        throw new Error("Invalid VM response — missing URLs");
      }

      vmDataRef.current = data;
      setStatus("running");
      setStatusLabel("");
    } catch (error) {
      setStatus("error");
      setErrorMsg(
        error instanceof Error ? error.message : "Failed to start VM",
      );
    } finally {
      startingRef.current = false;
    }
  };

  const handleResume = async () => {
    setStatus("running");
    setActionError("");
  };

  // oxlint-disable-next-line ban-use-effect/ban-use-effect — auto-start on mount requires DOM lifecycle; no React 19 alternative
  useEffect(() => {
    if (inset?.entity?.id) {
      handleStart();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inset?.entity?.id]);

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

  // Detect suspension via SSE disconnect
  // oxlint-disable-next-line ban-use-effect/ban-use-effect — responds to vmEvents.suspended changing; drives status transition
  useEffect(() => {
    if (vmEvents.suspended && status === "running") {
      setStatus("suspended");
    }
    if (!vmEvents.suspended && status === "suspended") {
      setStatus("running");
    }
  }, [vmEvents.suspended, status]);

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

  if (status === "idle" || status === "stopping") {
    const isStopping = status === "stopping";
    return (
      <div className="flex flex-col items-center justify-center w-full h-full gap-4">
        <Monitor04 size={48} className="text-muted-foreground/40" />
        <h3 className="text-lg font-medium">Preview</h3>
        <p className="text-sm text-muted-foreground text-center max-w-sm">
          Start preview server
        </p>
        <Button onClick={handleStart} disabled={isStopping}>
          {isStopping && <Loading01 size={14} className="animate-spin" />}
          {isStopping ? "Stopping..." : "Start Preview"}
        </Button>
      </div>
    );
  }

  if (status === "creating") {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full gap-4">
        <Loading01 size={24} className="animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{statusLabel}</p>
        <LiveTimer since={startedAtRef.current} />
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

  const isRunning = status === "running" || status === "suspended";

  return (
    <div className="flex flex-col w-full h-full">
      {/* Unified toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        {isRunning && hasHtmlPreview && (
          <ViewModeToggle
            value={viewMode}
            onValueChange={handleViewModeChange}
            options={VIEW_MODE_OPTIONS}
            size="sm"
          />
        )}
        <div className="flex items-center gap-1 flex-1 min-w-0 rounded-md border border-border bg-muted/40 px-2 py-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 h-5 w-5 p-0"
                onClick={() => {
                  if (previewIframeRef.current) {
                    // oxlint-disable-next-line no-self-assign — intentional: reloads the iframe by re-assigning its src
                    previewIframeRef.current.src = previewIframeRef.current.src;
                  }
                }}
              >
                <RefreshCw01 size={12} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Refresh</TooltipContent>
          </Tooltip>
          <span className="text-xs text-muted-foreground font-mono truncate flex-1">
            {vmData.previewUrl}
          </span>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0"
              onClick={() =>
                window.open(vmData.previewUrl, "_blank", "noopener")
              }
            >
              <LinkExternal01 size={14} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Open in new tab</TooltipContent>
        </Tooltip>
      </div>

      {/* Content area */}
      <div className="flex-1 relative overflow-hidden">
        {status === "suspended" && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-background/80 backdrop-blur-sm">
            <p className="text-sm text-muted-foreground">
              VM suspended due to inactivity.
            </p>
            <Button onClick={handleResume}>Resume</Button>
          </div>
        )}

        {actionError && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive shadow-sm">
            <span>{actionError}</span>
            <button
              type="button"
              className="ml-1 text-destructive/60 hover:text-destructive"
              onClick={() => setActionError("")}
            >
              &times;
            </button>
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
        <iframe
          ref={previewIframeRef}
          src={vmData.previewUrl}
          className="w-full h-full border-0"
          title="Dev Server Preview"
          onLoad={() => {
            if (viewMode === "visual") {
              injectVisualEditor();
            }
          }}
        />
      </div>
    </div>
  );
}
