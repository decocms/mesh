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
  VISUAL_EDITOR_SCRIPT,
  VisualEditorPayloadSchema,
  type VisualEditorPayload,
} from "./preview/visual-editor-script";
import { VisualEditorPrompt } from "./preview/visual-editor-prompt";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
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
  | "installing"
  | "running"
  | "suspended"
  | "error";
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
          setShowTerminal(!isHtml);
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

      if (!data.isNewVm) {
        // Existing VM — go straight to running
        setStatus("running");
        setShowTerminal(false);
        setHasHtmlPreview(true); // assume HTML for existing VMs
        return;
      }

      // New VM — show terminal, run install + dev
      setShowTerminal(true);
      setStatus("installing");

      await handleExec("install");
      await handleExec("dev");
      await pollPreview();

      setStatus("running");
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
    setStatus("installing");
    setShowTerminal(true);
    try {
      await handleExec("dev");
      await pollPreview();
      setStatus("running");
    } catch (error) {
      setStatus("error");
      setErrorMsg(
        error instanceof Error ? error.message : "Failed to resume VM",
      );
    }
  };

  const handleStop = async () => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    const virtualMcpId = inset?.entity?.id;
    vmDataRef.current = null;
    setStatus("idle");
    setHasHtmlPreview(false);
    setShowTerminal(false);
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

  const handleViewModeChange = (mode: PreviewViewMode) => {
    setViewMode(mode);
    setVisualElement(null);
    if (mode === "visual") {
      injectVisualEditor();
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

  if (status === "creating") {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full gap-4">
        <Loading01 size={24} className="animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Creating VM...</p>
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

  // Installing state — terminal full height, no preview panel
  if (status === "installing") {
    return (
      <div className="flex flex-col w-full h-full">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <div className="flex items-center gap-1.5 px-2.5 h-7 text-xs text-muted-foreground">
            <Loading01
              size={14}
              className="animate-spin text-muted-foreground"
            />
            Installing...
          </div>
          <div className="flex-1" />
          <button
            type="button"
            onClick={handleStop}
            title={vmDataRef.current?.vmId ?? undefined}
            className="flex items-center gap-1.5 px-2.5 h-7 rounded-md text-xs transition-colors shrink-0 bg-accent text-foreground"
          >
            <StopCircle size={14} />
          </button>
        </div>
        <div className="flex-1">
          {hasTerminal && (
            <iframe
              src={vmData.terminalUrl ?? undefined}
              className="w-full h-full border-0"
              title="VM Terminal"
              allow="clipboard-read; clipboard-write"
            />
          )}
          {!hasTerminal && (
            <div className="flex flex-col items-center justify-center w-full h-full gap-3">
              <Loading01
                size={20}
                className="animate-spin text-muted-foreground"
              />
              <p className="text-sm text-muted-foreground">
                Installing dependencies and starting dev server...
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Running / Suspended states
  return (
    <div className="flex flex-col w-full h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        {hasHtmlPreview && (
          <ViewModeToggle
            value={viewMode}
            onValueChange={handleViewModeChange}
            options={VIEW_MODE_OPTIONS}
            size="sm"
          />
        )}
        {hasTerminal && (
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
                  setStatus("installing");
                  try {
                    await handleExec("install");
                    await handleExec("dev");
                    await pollPreview();
                    setStatus("running");
                  } catch (error) {
                    setStatus("error");
                    setErrorMsg(
                      error instanceof Error
                        ? error.message
                        : "Reinstall failed",
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
                  try {
                    await handleExec("dev");
                    await pollPreview();
                  } catch (error) {
                    setStatus("error");
                    setErrorMsg(
                      error instanceof Error ? error.message : "Restart failed",
                    );
                  }
                }}
              >
                Restart Dev Server
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0"
          onClick={() => window.open(vmData.previewUrl, "_blank", "noopener")}
        >
          <LinkExternal01 size={14} />
        </Button>
        <button
          type="button"
          onClick={handleStop}
          className="flex items-center gap-1.5 px-2.5 h-7 rounded-md text-xs transition-colors shrink-0 bg-accent text-foreground"
        >
          <StopCircle size={14} />
        </button>
      </div>

      <div className="flex-1 relative">
        {status === "suspended" && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-background/80 backdrop-blur-sm">
            <p className="text-sm text-muted-foreground">
              VM suspended due to inactivity.
            </p>
            <Button onClick={handleResume}>Resume</Button>
          </div>
        )}

        {hasHtmlPreview && !showTerminal && (
          <div className="relative w-full h-full">
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
        )}

        {hasHtmlPreview && showTerminal && hasTerminal && (
          <ResizablePanelGroup direction="vertical">
            <ResizablePanel minSize={20}>
              <div className="relative w-full h-full">
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
            </ResizablePanel>
            <ResizableHandle className="h-[3px] bg-border/60 hover:bg-primary/30 transition-colors" />
            <ResizablePanel defaultSize={40} minSize={15}>
              <iframe
                src={vmData.terminalUrl ?? undefined}
                className="w-full h-full border-0"
                title="VM Terminal"
                allow="clipboard-read; clipboard-write"
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        )}

        {!hasHtmlPreview && hasTerminal && (
          <iframe
            src={vmData.terminalUrl ?? undefined}
            className="w-full h-full border-0"
            title="VM Terminal"
            allow="clipboard-read; clipboard-write"
          />
        )}

        {!hasHtmlPreview && !hasTerminal && (
          <div className="flex flex-col items-center justify-center w-full h-full gap-3">
            <p className="text-sm text-muted-foreground">
              No preview available.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
