import { useState, useRef, useEffect } from "react";
import { useInsetContext } from "@/web/layouts/agent-shell-layout";
import { authClient } from "@/web/lib/auth-client";
import { useToggleEnvPanel } from "@/web/hooks/use-toggle-env-panel";
import { useChatTask } from "@/web/components/chat/context";
import {
  useProjectContext,
  useMCPClient,
  SELF_MCP_ALIAS_ID,
} from "@decocms/mesh-sdk";
import { useQuery } from "@tanstack/react-query";
import {
  CursorClick01,
  LinkExternal01,
  Loading01,
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
  { value: "preview", icon: <Monitor04 size={14} />, tooltip: "Interactive" },
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

  // Read VM data from entity metadata (Freestyle path)
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

  // Docker path: resolve the preview URL from the thread-scoped endpoint so
  // bash and the iframe share the same container keyed by thread.sandbox_ref.
  // Endpoint always returns an object so the client can tell "thread never
  // existed" (auto-spin candidate) from "thread exists but sandbox is
  // dormant" (user must click). Freestyle threads get `handle: null` and we
  // fall back to activeVms below.
  const { org } = useProjectContext();
  const { taskId } = useChatTask();
  const { data: threadSandbox } = useQuery<{
    threadExists: boolean;
    sandboxRef: string | null;
    handle: string | null;
    previewUrl: string | null;
    serverUp: boolean;
    phase: string | null;
  } | null>({
    queryKey: ["thread-sandbox", org.slug ?? org.id, taskId],
    enabled: !!taskId,
    // Keep polling while the dev server is still booting so status/logs in
    // the proxy's loading page stay fresh. Once `serverUp` flips, the iframe
    // is already mounted at the same URL and will pick up the real response
    // on its next request — no extra poll needed.
    staleTime: 2_000,
    refetchInterval: (q) => (q.state.data?.serverUp ? false : 2_000),
    queryFn: async () => {
      const res = await fetch(
        `/api/${org.slug ?? org.id}/decopilot/threads/${taskId}/sandbox`,
      );
      if (!res.ok) return null;
      return (await res.json()) as {
        threadExists: boolean;
        sandboxRef: string | null;
        handle: string | null;
        previewUrl: string | null;
        serverUp: boolean;
        phase: string | null;
      };
    },
  });

  // Docker path takes precedence: if the thread has a sandbox_ref at all,
  // mount the iframe unconditionally. When the dev server is still booting
  // or crashed, the sandbox-preview proxy renders a loading page for the
  // initial HTML request — so `previewUrl` is always safe to use here.
  // Freestyle (no docker handle) keeps using activeVms unchanged.
  const previewUrl = threadSandbox?.previewUrl ?? vmEntry?.previewUrl ?? null;

  // Auto-spin the VM for brand-new threads (no DB row yet). Old threads stay
  // manual — the env panel's Run button is the entry point for reviving a
  // dormant sandbox so browsing thread history doesn't spin containers.
  const mcpClient = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });
  const autoStartedForTaskRef = useRef<string | null>(null);
  const [autoStartFailed, setAutoStartFailed] = useState(false);
  const virtualMcpId = inset?.entity?.id ?? null;
  const shouldAutoStart =
    !!taskId &&
    !!virtualMcpId &&
    !!threadSandbox &&
    !threadSandbox.threadExists &&
    autoStartedForTaskRef.current !== taskId;
  // oxlint-disable-next-line ban-use-effect/ban-use-effect — 500ms debounced side-effect; no React 19 alternative
  useEffect(() => {
    if (!shouldAutoStart || !taskId || !virtualMcpId) return;
    const targetTaskId = taskId;
    const timer = setTimeout(() => {
      autoStartedForTaskRef.current = targetTaskId;
      setAutoStartFailed(false);
      mcpClient
        .callTool({
          name: "VM_START",
          arguments: { virtualMcpId, threadId: targetTaskId },
        })
        .catch((err) => {
          // Leave the flag set — don't retry on loop. Surface the button so
          // the user can click the env panel Run button to retry manually.
          console.error("[preview] auto-start VM_START failed", err);
          setAutoStartFailed(true);
        });
    }, 500);
    return () => clearTimeout(timer);
  }, [shouldAutoStart, taskId, virtualMcpId, mcpClient]);
  // Reset the failure flag when navigating to a different thread so a new
  // thread starts with a clean slate.
  // oxlint-disable-next-line ban-use-effect/ban-use-effect — resets per-task state when taskId changes
  useEffect(() => {
    setAutoStartFailed(false);
  }, [taskId]);

  // Auto-open the env (logs) panel the first time a thread has a running
  // sandbox. Previously the "Start Server" button was the entry point that
  // opened it as a side effect — without that button, old threads with
  // already-running containers had no way to surface logs. Keyed on taskId
  // so if the user explicitly closes the panel on a thread, we respect that
  // and don't reopen on the same thread.
  const envAutoOpenedForTaskRef = useRef<string | null>(null);
  // oxlint-disable-next-line ban-use-effect/ban-use-effect — one-shot side-effect per (taskId, first previewUrl)
  useEffect(() => {
    if (!taskId || !previewUrl) return;
    if (envAutoOpenedForTaskRef.current === taskId) return;
    envAutoOpenedForTaskRef.current = taskId;
    openEnv();
  }, [taskId, previewUrl, openEnv]);

  // Empty-state discriminator. While the thread-sandbox query is loading
  // (threadSandbox === undefined) we render nothing to avoid button flicker.
  const isAutoSpinning =
    !previewUrl &&
    !!threadSandbox &&
    !threadSandbox.threadExists &&
    !autoStartFailed;
  const showManualStart =
    !previewUrl &&
    !!threadSandbox &&
    (threadSandbox.threadExists || autoStartFailed);

  const vmEvents = useVmEvents(previewUrl, null);
  const hasHtmlPreview = vmEvents.status.htmlSupport;
  const suspended = vmEvents.suspended;

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

  return (
    <div className="flex flex-col w-full h-full">
      {/* Unified toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        {previewUrl && hasHtmlPreview && (
          <ViewModeToggle
            value={viewMode}
            onValueChange={handleViewModeChange}
            options={VIEW_MODE_OPTIONS}
            size="sm"
          />
        )}
        <div className="flex items-center gap-1 flex-1 min-w-0 rounded-md border border-border bg-muted/40 px-2 py-1">
          {previewUrl ? (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 h-5 w-5 p-0"
                    onClick={() => {
                      if (previewIframeRef.current) {
                        const iframe = previewIframeRef.current;
                        // biome-ignore lint/correctness/noSelfAssign: reloads the iframe
                        // oxlint-disable-next-line no-self-assign
                        iframe.src = iframe.src;
                      }
                    }}
                  >
                    <RefreshCw01 size={12} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Refresh</TooltipContent>
              </Tooltip>
              <span className="text-xs text-muted-foreground font-mono truncate flex-1">
                {previewUrl}
              </span>
            </>
          ) : (
            <span className="text-xs text-muted-foreground font-mono truncate flex-1">
              No server running
            </span>
          )}
        </div>
        {previewUrl && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0"
                onClick={() => window.open(previewUrl, "_blank", "noopener")}
              >
                <LinkExternal01 size={14} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Open in new tab</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Content area */}
      <div className="flex-1 relative overflow-hidden">
        {isAutoSpinning && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-background">
            <Loading01
              size={28}
              className="text-muted-foreground animate-spin"
            />
            <h3 className="text-sm font-medium">Starting dev server…</h3>
          </div>
        )}
        {showManualStart && (
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
            className="w-full h-full border-0"
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
