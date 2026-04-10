import { useState, useRef } from "react";
import {
  useProjectContext,
  useMCPClient,
  SELF_MCP_ALIAS_ID,
} from "@decocms/mesh-sdk";
import { useInsetContext } from "@/web/layouts/agent-shell-layout";
import { Loading01, Monitor04, Terminal } from "@untitledui/icons";
import { Button } from "@deco/ui/components/button.tsx";
import { cn } from "@deco/ui/lib/utils.ts";

interface VmData {
  terminalUrl: string | null;
  previewUrl: string;
  vmId: string;
}

type ViewStatus = "idle" | "starting" | "running" | "error";

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
    const vmId = vmDataRef.current?.vmId;
    vmDataRef.current = null;
    setStatus("idle");
    setPreviewReady(false);

    if (vmId) {
      try {
        await client.callTool({
          name: "VM_STOP",
          arguments: { vmId },
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
      <div className="flex flex-col items-center justify-center h-full gap-4">
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
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Loading01 size={24} className="animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Creating VM and starting dev server...
        </p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
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
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-1">
          {hasTerminal && (
            <button
              type="button"
              onClick={() => setActiveView("terminal")}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors",
                activeView === "terminal"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Terminal size={14} />
              Terminal
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              previewReady ? setActiveView("preview") : handleOpenPreview()
            }
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors",
              activeView === "preview"
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Monitor04 size={14} />
            Preview
            {!previewReady && <Loading01 size={10} className="animate-spin" />}
          </button>
        </div>
        <Button variant="ghost" size="sm" onClick={handleStop}>
          Stop
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
          <iframe
            src={vmData.previewUrl}
            className={cn(
              "absolute inset-0 w-full h-full border-0",
              activeView !== "preview" && "hidden",
            )}
            title="Dev Server Preview"
          />
        )}
      </div>
    </div>
  );
}
