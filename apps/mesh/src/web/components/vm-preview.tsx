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
  Play,
  RefreshCw01,
  StopCircle,
  Terminal,
} from "@untitledui/icons";
import { Button } from "@deco/ui/components/button.tsx";
import {
  ViewModeToggle,
  type ViewModeOption,
} from "@deco/ui/components/view-mode-toggle.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import {
  VISUAL_EDITOR_SCRIPT,
  VisualEditorPayloadSchema,
  type VisualEditorPayload,
} from "./preview/visual-editor-script";
import { VisualEditorPrompt } from "./preview/visual-editor-prompt";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
  type ImperativePanelHandle,
} from "./resizable";
import { useVmEvents } from "@/web/hooks/use-vm-events";
import { VmTerminal } from "./vm-terminal";
import { EmptyState } from "./empty-state";

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

export function VmPreviewContent() {
  const { org } = useProjectContext();
  const inset = useInsetContext();
  const [status, setStatus] = useState<ViewStatus>("idle");
  const [statusLabel, setStatusLabel] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [actionError, setActionError] = useState("");
  const [execInFlight, setExecInFlight] = useState(false);
  const vmDataRef = useRef<VmData | null>(null);
  const startingRef = useRef(false);

  // Terminal panel state
  const [terminalOpen, setTerminalOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<"setup" | "install" | "dev">(
    "dev",
  );
  const previewPanelRef = useRef<ImperativePanelHandle>(null);
  const terminalPanelRef = useRef<ImperativePanelHandle>(null);

  // Visual editor state
  const [viewMode, setViewMode] = useState<PreviewViewMode>("preview");
  const [visualElement, setVisualElement] =
    useState<VisualEditorPayload | null>(null);
  const previewIframeRef = useRef<HTMLIFrameElement>(null);

  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  // SSE connection to daemon — only active when VM is running
  const vmEvents = useVmEvents(
    status === "running" ? (vmDataRef.current?.previewUrl ?? null) : null,
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

  const handleExec = async (action: "install" | "dev") => {
    if (execInFlight || !vmDataRef.current) return;
    setExecInFlight(true);
    try {
      const res = await fetch(
        `${vmDataRef.current.previewUrl}/_daemon/exec/${action}`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error(`Exec failed: ${res.statusText}`);
    } finally {
      setExecInFlight(false);
    }
  };

  const handleStart = async () => {
    if (startingRef.current) return;
    startingRef.current = true;
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

      if (!data.isNewVm) {
        return;
      }

      // New VM — run install automatically
      await handleExec("install");
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

  const handleStop = async () => {
    vmDataRef.current = null;
    setStatus("stopping");
    setVisualElement(null);
    setViewMode("preview");

    const virtualMcpId = inset?.entity?.id;
    if (virtualMcpId) {
      try {
        await client.callTool({
          name: "VM_DELETE",
          arguments: { virtualMcpId },
        });
      } catch {
        // Best effort
      }
    }

    setStatus("idle");
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

  // oxlint-disable-next-line ban-use-effect/ban-use-effect — expand/collapse preview panel based on htmlSupport; requires imperative panel API
  useEffect(() => {
    const panel = previewPanelRef.current;
    if (!panel) return;
    if (hasHtmlPreview) {
      panel.resize(70);
    } else {
      panel.collapse();
    }
  }, [hasHtmlPreview]);

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
          Start preview environment
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
        {isRunning && (
          <button
            type="button"
            className={cn(
              "flex items-center gap-1.5 px-2.5 h-7 rounded-md text-xs transition-colors shrink-0",
              terminalOpen
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => {
              const panel = terminalPanelRef.current;
              if (!panel) return;
              if (panel.isCollapsed()) {
                panel.expand();
              } else {
                panel.collapse();
              }
            }}
          >
            <Terminal size={14} />
          </button>
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
          {vmData.vmId && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground cursor-pointer hover:bg-accent hover:text-foreground transition-colors"
                  onClick={() => navigator.clipboard.writeText(vmData.vmId)}
                >
                  {vmData.vmId}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Copy VM ID</TooltipContent>
            </Tooltip>
          )}
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
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleStop}
              className="flex items-center gap-1.5 px-2.5 h-7 rounded-md text-xs transition-colors shrink-0 bg-accent text-foreground"
            >
              <StopCircle size={14} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Stop VM</TooltipContent>
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

        <ResizablePanelGroup direction="vertical" className="h-full">
          <ResizablePanel
            ref={previewPanelRef}
            collapsible
            collapsedSize={0}
            minSize={20}
            defaultSize={0}
            className="relative overflow-hidden"
          >
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
          </ResizablePanel>

          <ResizableHandle />

          <ResizablePanel
            ref={terminalPanelRef}
            collapsible
            collapsedSize={0}
            minSize={15}
            defaultSize={100}
            className="overflow-hidden"
            onCollapse={() => setTerminalOpen(false)}
            onExpand={() => setTerminalOpen(true)}
          >
            <div className="flex flex-col h-full">
              <div className="flex items-center gap-0 border-b border-border px-2 shrink-0">
                {(["setup", "install", "dev"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                      activeTab === tab
                        ? "text-foreground border-b-2 border-primary"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {tab}
                  </button>
                ))}
                {(activeTab === "install" || activeTab === "dev") && (
                  <button
                    type="button"
                    disabled={execInFlight}
                    onClick={() => handleExec(activeTab)}
                    className="ml-auto flex items-center gap-1 px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  >
                    {execInFlight ? (
                      <Loading01 size={12} className="animate-spin" />
                    ) : (
                      <Play size={12} />
                    )}
                    {execInFlight
                      ? "Running..."
                      : activeTab === "install"
                        ? "Re-install"
                        : vmEvents.devLogs.length > 0
                          ? "Restart Dev"
                          : "Run Dev"}
                  </button>
                )}
              </div>
              <div className="flex-1 overflow-hidden">
                {activeTab === "setup" && (
                  <VmTerminal
                    lines={[...vmEvents.installLogs, ...vmEvents.devLogs]}
                    className="h-full"
                  />
                )}
                {activeTab === "install" &&
                  (vmEvents.installLogs.length > 0 ? (
                    <VmTerminal
                      lines={vmEvents.installLogs}
                      className="h-full"
                    />
                  ) : (
                    <EmptyState
                      className="h-full"
                      image={null}
                      title="Dependencies not installed"
                      description="Install project dependencies to set up your environment."
                      actions={
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={execInFlight}
                          onClick={() => handleExec("install")}
                        >
                          {execInFlight ? (
                            <Loading01 size={14} className="animate-spin" />
                          ) : (
                            <Play size={14} />
                          )}
                          Install
                        </Button>
                      }
                    />
                  ))}
                {activeTab === "dev" &&
                  (vmEvents.devLogs.length > 0 ? (
                    <VmTerminal lines={vmEvents.devLogs} className="h-full" />
                  ) : (
                    <EmptyState
                      className="h-full"
                      image={null}
                      title="Dev server not running"
                      description="Start the dev server to preview your application."
                      actions={
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={execInFlight}
                          onClick={() => handleExec("dev")}
                        >
                          {execInFlight ? (
                            <Loading01 size={14} className="animate-spin" />
                          ) : (
                            <Play size={14} />
                          )}
                          Run Dev
                        </Button>
                      }
                    />
                  ))}
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
