import { useState, useRef, useEffect } from "react";
import {
  useProjectContext,
  useMCPClient,
  SELF_MCP_ALIAS_ID,
} from "@decocms/mesh-sdk";
import { useInsetContext } from "@/web/layouts/agent-shell-layout";
import {
  ChevronDown,
  CursorClick01,
  LinkExternal01,
  Loading01,
  Monitor04,
  RefreshCw01,
  StopCircle,
  Terminal,
} from "@untitledui/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@deco/ui/components/dropdown-menu.tsx";
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
  { value: "preview", icon: <Monitor04 size={14} />, tooltip: "Preview" },
  {
    value: "visual",
    icon: <CursorClick01 size={14} />,
    tooltip: "Visual Editor",
  },
];

function formatActionError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  // Strip MCP protocol prefixes like "MCP error -32602: "
  const msg = error.message.replace(/^MCP error -?\d+:\s*/i, "");
  return msg || fallback;
}

export function VmPreviewContent() {
  const { org } = useProjectContext();
  const inset = useInsetContext();
  const [status, setStatus] = useState<ViewStatus>("idle");
  const [statusLabel, setStatusLabel] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [actionError, setActionError] = useState("");
  const [showTerminal, setShowTerminal] = useState(false);
  const [hasHtmlPreview, setHasHtmlPreview] = useState(false);
  const [execInFlight, setExecInFlight] = useState(false);
  const vmDataRef = useRef<VmData | null>(null);
  const startingRef = useRef(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Visual editor state
  const [viewMode, setViewMode] = useState<PreviewViewMode>("preview");
  const [visualElement, setVisualElement] =
    useState<VisualEditorPayload | null>(null);
  const previewIframeRef = useRef<HTMLIFrameElement>(null);
  const previewPanelRef = useRef<ImperativePanelHandle>(null);
  const terminalPanelRef = useRef<ImperativePanelHandle>(null);

  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

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
    if (execInFlight || !inset?.entity) return;
    setExecInFlight(true);
    try {
      const data = (await callTool("VM_EXEC", {
        virtualMcpId: inset.entity.id,
        action,
      })) as { success: boolean; error?: string };
      if (!data.success) throw new Error(data.error ?? "Command failed");
    } finally {
      setExecInFlight(false);
    }
  };

  const pollPreview = async () => {
    const vmData = vmDataRef.current;
    if (!vmData || !inset?.entity) return;
    for (let i = 0; i < 20; i++) {
      try {
        const probe = (await callTool("VM_PROBE", {
          virtualMcpId: inset.entity.id,
          url: vmData.previewUrl,
        })) as { status: number; contentType: string | null };
        if (probe.status >= 200 && probe.status < 300) {
          const isHtml = probe.contentType?.includes("text/html") ?? false;
          setHasHtmlPreview(isHtml);
          if (isHtml && previewIframeRef.current) {
            previewIframeRef.current.src = vmData.previewUrl;
          }
          return;
        }
      } catch {
        /* ignore probe errors, keep polling */
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
    // Server never responded — keep terminal
    setHasHtmlPreview(false);
    setShowTerminal(true);
  };

  const handleStart = async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setStatus("creating");
    setStatusLabel("Connecting...");
    setErrorMsg("");
    setHasHtmlPreview(false);

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
        // Existing VM — kick off dev server restart without blocking.
        // vm.exec() can hang on freshly-resumed VMs, so fire-and-forget
        // and go straight to polling the preview URL.
        setShowTerminal(false);
        setHasHtmlPreview(true);
        handleExec("dev").catch(() => {});
        pollPreview();
        return;
      }

      // New VM — show terminal, run install + dev
      // The ttyd watches /tmp/vm.log so progress is visible there
      setShowTerminal(true);

      await handleExec("install");
      await handleExec("dev");
      await pollPreview();
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
    setShowTerminal(true);
    setActionError("");
    try {
      await handleExec("dev");
      await pollPreview();
    } catch (error) {
      setActionError(formatActionError(error, "Failed to resume VM"));
    }
  };

  const handleStop = async () => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }

    // Immediately show the idle screen with a spinner
    vmDataRef.current = null;
    setStatus("stopping");
    setHasHtmlPreview(false);
    setShowTerminal(false);
    setVisualElement(null);
    setViewMode("preview");

    // Delete the VM in the background so the DB entry is cleared.
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

  // oxlint-disable-next-line ban-use-effect/ban-use-effect — heartbeat polling requires interval lifecycle; no React 19 alternative
  useEffect(() => {
    if (
      status !== "running" ||
      !vmDataRef.current?.terminalUrl ||
      !inset?.entity
    ) {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      return;
    }
    heartbeatRef.current = setInterval(async () => {
      try {
        const probe = (await callTool("VM_PROBE", {
          virtualMcpId: inset.entity!.id,
          url: vmDataRef.current!.terminalUrl!,
        })) as { status: number; contentType: string | null };
        if (probe.status !== 200 && probe.status !== 0) {
          setStatus("suspended");
        }
      } catch {
        /* ignore */
      }
    }, 10_000);
    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };
  }, [status]);

  const injectVisualEditor = () => {
    const win = previewIframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage(
      { type: "visual-editor::activate", script: VISUAL_EDITOR_SCRIPT },
      "*",
    );
  };

  // oxlint-disable-next-line ban-use-effect/ban-use-effect — imperative panel collapse/expand requires DOM lifecycle
  useEffect(() => {
    const isRunning = status === "running" || status === "suspended";
    const showPreview = hasHtmlPreview && isRunning;
    if (showPreview) previewPanelRef.current?.expand();
    else previewPanelRef.current?.collapse();

    if (showTerminal) terminalPanelRef.current?.expand();
    else terminalPanelRef.current?.collapse();
  }, [hasHtmlPreview, status, showTerminal]);

  const handleViewModeChange = (mode: PreviewViewMode) => {
    setViewMode(mode);
    setVisualElement(null);
    if (mode === "visual") {
      injectVisualEditor();
    }
  };

  if (status === "idle" || status === "stopping") {
    const isStopping = status === "stopping";
    return (
      <div className="flex flex-col items-center justify-center w-full h-full gap-4">
        <Monitor04 size={48} className="text-muted-foreground/40" />
        <h3 className="text-lg font-medium">Preview</h3>
        <p className="text-sm text-muted-foreground text-center max-w-sm">
          Start a development server from your connected GitHub repository.
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

  const hasTerminal = !!vmData.terminalUrl;
  const isRunning = status === "running" || status === "suspended";

  const showPreviewPane = hasHtmlPreview && isRunning;

  return (
    <div className="flex flex-col w-full h-full">
      {/* Unified toolbar — one instance, adapts to status */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        {isRunning && hasHtmlPreview && (
          <ViewModeToggle
            value={viewMode}
            onValueChange={handleViewModeChange}
            options={VIEW_MODE_OPTIONS}
            size="sm"
          />
        )}
        {isRunning && hasTerminal && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "flex items-center gap-1.5 px-2.5 h-7 rounded-md text-xs transition-colors shrink-0",
                  showTerminal
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Terminal size={14} />
                <ChevronDown size={10} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => setShowTerminal((p) => !p)}>
                {showTerminal ? "Hide Logs" : "Show Logs"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={execInFlight}
                onClick={async () => {
                  setShowTerminal(true);
                  setActionError("");
                  try {
                    await handleExec("install");
                  } catch (error) {
                    setActionError(
                      formatActionError(error, "Reinstall failed"),
                    );
                  }
                }}
              >
                Reinstall Dependencies
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={execInFlight}
                onClick={async () => {
                  setShowTerminal(true);
                  setActionError("");
                  try {
                    await handleExec("dev");
                    await pollPreview();
                  } catch (error) {
                    setActionError(formatActionError(error, "Restart failed"));
                  }
                }}
              >
                Restart Dev Server
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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

      {/* Content area — single ResizablePanelGroup, imperative collapse/expand controls visibility */}
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
            defaultSize={hasTerminal ? 60 : 100}
            className="relative overflow-hidden rounded-[inherit]"
          >
            {viewMode === "visual" && !visualElement && showPreviewPane && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 rounded-full border border-violet-400/40 bg-violet-500/90 px-3 py-1 text-xs font-medium text-white shadow-md backdrop-blur-sm pointer-events-none select-none">
                <CursorClick01 size={12} />
                Click any element to ask the AI
              </div>
            )}
            {viewMode === "visual" && visualElement && showPreviewPane && (
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

          {hasTerminal && (
            <>
              <ResizableHandle className="h-[3px] bg-border/60 hover:bg-primary/30 transition-colors" />
              <ResizablePanel
                ref={terminalPanelRef}
                collapsible
                collapsedSize={0}
                minSize={15}
                defaultSize={40}
                className="overflow-hidden rounded-[inherit]"
              >
                <iframe
                  src={vmData.terminalUrl ?? undefined}
                  className="w-full h-full border-0"
                  title="VM Terminal"
                />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
