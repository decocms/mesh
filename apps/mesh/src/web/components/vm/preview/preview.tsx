import { useState, useRef, useEffect } from "react";
import { useInsetContext } from "@/web/layouts/agent-shell-layout";
import { authClient } from "@/web/lib/auth-client";
import { useToggleEnvPanel } from "@/web/hooks/use-toggle-env-panel";
import { useChatTask } from "@/web/components/chat/context";
import { useMCPClient, SELF_MCP_ALIAS_ID } from "@decocms/mesh-sdk";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateVirtualMcpQueries } from "@/web/lib/query-keys";

import type { VmMapEntry } from "@decocms/mesh-sdk";
import {
  CursorClick01,
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
  VISUAL_EDITOR_SCRIPT,
  VisualEditorPayloadSchema,
  type VisualEditorPayload,
} from "./visual-editor-script";
import { VisualEditorPrompt } from "./visual-editor-prompt";
import { useVmEvents, useVmReloadHandler } from "../hooks/use-vm-events";
import { VmSuspendedState } from "../vm-suspended-state";
import { VmBootingState } from "../vm-booting-state";

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
  const { taskId, currentBranch: branch, setCurrentTaskBranch } = useChatTask();

  // Visual editor state
  const [viewMode, setViewMode] = useState<PreviewViewMode>("preview");
  const [visualElement, setVisualElement] =
    useState<VisualEditorPayload | null>(null);
  const previewIframeRef = useRef<HTMLIFrameElement>(null);

  // Read VM data from entity metadata, keyed by (userId, branch).
  // vmMap[userId][branch] -> { vmId, previewUrl, runnerKind? }
  const userId = session?.user?.id;
  const metadata = inset?.entity?.metadata as
    | { vmMap?: Record<string, Record<string, VmMapEntry>> }
    | undefined;
  const vmEntry =
    userId && branch ? metadata?.vmMap?.[userId]?.[branch] : undefined;
  const previewUrl = vmEntry?.previewUrl ?? null;

  // Read SSE state from the shared VmEventsProvider. Subscribe to the
  // daemon's "reload" event for iframe refresh on config edits that
  // framework HMR doesn't watch (.ts/.tsx edits go through the framework's
  // own reload path).
  const vmEvents = useVmEvents();
  useVmReloadHandler(() => {
    const iframe = previewIframeRef.current;
    if (!iframe) return;
    // biome-ignore lint/correctness/noSelfAssign: reloads the iframe
    // oxlint-disable-next-line no-self-assign
    iframe.src = iframe.src;
  });
  const hasHtmlPreview = vmEvents.status.htmlSupport;
  const suspended = vmEvents.suspended;

  // Gate the iframe on upstream readiness so the user doesn't see the
  // browser's "didn't send any data" page while the container is still
  // booting / installing / waiting for the dev server to bind. Once the
  // upstream has ever reported ready for this previewUrl, keep the iframe
  // mounted — brief HMR hiccups shouldn't re-show the boot screen.
  const bootTrackedRef = useRef<{ url: string; at: number; ready: boolean }>({
    url: "",
    at: 0,
    ready: false,
  });
  if (previewUrl && bootTrackedRef.current.url !== previewUrl) {
    bootTrackedRef.current = { url: previewUrl, at: Date.now(), ready: false };
  }
  if (previewUrl && vmEvents.status.ready && !bootTrackedRef.current.ready) {
    bootTrackedRef.current.ready = true;
  }
  const booting = !!previewUrl && !bootTrackedRef.current.ready && !suspended;

  // Auto-start for github-linked threads when no vmEntry exists. Passes the
  // URL branch if present; otherwise VM_START generates one and we persist
  // it back to the URL.
  const virtualMcpId = inset?.entity?.id ?? null;
  const mcpClient = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: inset?.entity?.organization_id ?? "",
  });
  const queryClient = useQueryClient();
  const autoStartedForTaskRef = useRef<string | null>(null);
  const [autoStartFailed, setAutoStartFailed] = useState(false);
  const shouldAutoStart =
    !!taskId &&
    !!virtualMcpId &&
    !!userId &&
    !vmEntry &&
    !autoStartFailed &&
    autoStartedForTaskRef.current !== taskId;
  // oxlint-disable-next-line ban-use-effect/ban-use-effect — 500ms debounced side-effect; no React 19 alternative
  useEffect(() => {
    if (!shouldAutoStart || !taskId || !virtualMcpId) return;
    const targetTaskId = taskId;
    const timer = setTimeout(() => {
      autoStartedForTaskRef.current = targetTaskId;
      setAutoStartFailed(false);
      const args: { virtualMcpId: string; branch?: string } = { virtualMcpId };
      if (branch) args.branch = branch;
      mcpClient
        .callTool({ name: "VM_START", arguments: args })
        .then((result) => {
          const data = (result as { structuredContent?: { branch?: string } })
            .structuredContent;
          if (data?.branch && !branch) setCurrentTaskBranch(data.branch);
        })
        .catch((err) => {
          console.error("[preview] auto-start VM_START failed", err);
          setAutoStartFailed(true);
        });
    }, 500);
    return () => clearTimeout(timer);
  }, [
    shouldAutoStart,
    taskId,
    virtualMcpId,
    mcpClient,
    branch,
    setCurrentTaskBranch,
  ]);
  // Reset the failure flag when navigating to a different thread.
  // oxlint-disable-next-line ban-use-effect/ban-use-effect — per-task state reset
  useEffect(() => {
    setAutoStartFailed(false);
  }, [taskId]);

  // Self-heal when vmMap points at a sandbox that no longer exists. The SSE
  // probe in useVmEvents flips `notFound` on 404; VM_START purges the stale
  // handle and writes a fresh entry into vmMap (Docker: via runner.ensure;
  // Freestyle: via the stale-entry fallback). Dedup by the dead vmId so we
  // don't loop on repeated 404s for the same handle.
  const reprovisionedForVmIdRef = useRef<string | null>(null);
  // oxlint-disable-next-line ban-use-effect/ban-use-effect — one-shot reprovision trigger gated on notFound signal from SSE probe
  useEffect(() => {
    if (!vmEvents.notFound) return;
    if (!vmEntry || !virtualMcpId) return;
    const deadVmId = vmEntry.vmId;
    if (reprovisionedForVmIdRef.current === deadVmId) return;
    reprovisionedForVmIdRef.current = deadVmId;

    const args: { virtualMcpId: string; branch?: string } = { virtualMcpId };
    if (branch) args.branch = branch;
    mcpClient
      .callTool({ name: "VM_START", arguments: args })
      .then(() => invalidateVirtualMcpQueries(queryClient))
      .catch((err) => {
        console.error("[preview] reprovision VM_START failed", err);
      });
  }, [
    vmEvents.notFound,
    vmEntry,
    virtualMcpId,
    branch,
    mcpClient,
    queryClient,
  ]);

  // Auto-open the env panel the first time a thread has a running sandbox.
  const envAutoOpenedForTaskRef = useRef<string | null>(null);
  // oxlint-disable-next-line ban-use-effect/ban-use-effect — one-shot per (taskId, first previewUrl)
  useEffect(() => {
    if (!taskId || !previewUrl) return;
    if (envAutoOpenedForTaskRef.current === taskId) return;
    envAutoOpenedForTaskRef.current = taskId;
    openEnv();
  }, [taskId, previewUrl, openEnv]);

  // Visual-editor postMessage listener.
  // oxlint-disable-next-line ban-use-effect/ban-use-effect — DOM event subscription
  useEffect(() => {
    if (!previewUrl) return;
    let allowedOrigin: string;
    try {
      allowedOrigin = new URL(previewUrl, window.location.href).origin;
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
      <div className="flex h-12 items-center gap-2 px-3 border-b border-border shrink-0">
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

      <div className="flex-1 relative overflow-hidden">
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

        {booting && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-background">
            <VmBootingState
              since={bootTrackedRef.current.at}
              hasSetupData={vmEvents.hasData("setup")}
              scripts={vmEvents.scripts}
              activeProcesses={vmEvents.activeProcesses}
              onViewLogs={openEnv}
            />
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
        {previewUrl && !booting && (
          <iframe
            // Keyed on previewUrl so cross-branch navigation unmounts the
            // old frame and mounts a fresh one — `src` mutations on the
            // same element don't reliably refetch in every browser, and
            // also leaks in-frame state (postMessage listeners, scroll
            // position) from the previous branch.
            key={previewUrl}
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
