import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  useProjectContext,
  useMCPClient,
  SELF_MCP_ALIAS_ID,
} from "@decocms/mesh-sdk";
import { useInsetContext } from "@/web/layouts/agent-shell-layout";
import { Loading01, Monitor04, Terminal } from "@untitledui/icons";
import { Button } from "@deco/ui/components/button.tsx";
import { cn } from "@deco/ui/lib/utils.ts";

type PreviewState =
  | { status: "idle" }
  | { status: "starting" }
  | {
      status: "terminal";
      terminalUrl: string;
      previewUrl: string;
      vmId: string;
    }
  | {
      status: "preview";
      terminalUrl: string;
      previewUrl: string;
      vmId: string;
    }
  | { status: "error"; message: string };

export function VmPreviewContent() {
  const { org } = useProjectContext();
  const inset = useInsetContext();
  const [state, setState] = useState<PreviewState>({ status: "idle" });
  const [activeView, setActiveView] = useState<"terminal" | "preview">(
    "terminal",
  );
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      if (!inset?.entity) throw new Error("No virtual MCP context");
      const result = await client.callTool({
        name: "VM_START",
        arguments: { virtualMcpId: inset.entity.id },
      });
      const payload =
        (result as { structuredContent?: unknown }).structuredContent ?? result;
      return payload as {
        terminalUrl: string;
        previewUrl: string;
        vmId: string;
      };
    },
    onSuccess: (data) => {
      setState({ status: "terminal", ...data });
      startPolling(data.previewUrl, data);
    },
    onError: (error) => {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Failed to start VM",
      });
    },
  });

  const startPolling = (
    previewUrl: string,
    data: { terminalUrl: string; previewUrl: string; vmId: string },
  ) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(previewUrl, {
          method: "HEAD",
          mode: "no-cors",
        });
        // no-cors returns opaque response, status 0 means it loaded
        if (res.status === 0 || res.ok) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setState({ status: "preview", ...data });
          setActiveView("preview");
        }
      } catch {
        // Not ready yet
      }
    }, 4000);
  };

  const stopVm = async (vmId: string) => {
    try {
      await client.callTool({
        name: "VM_STOP",
        arguments: { vmId },
      });
    } catch {
      // Best effort
    }
  };

  const handleStart = () => {
    setState({ status: "starting" });
    startMutation.mutate();
  };

  const handleStop = () => {
    if (state.status === "terminal" || state.status === "preview") {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      stopVm(state.vmId);
    }
    setState({ status: "idle" });
  };

  if (state.status === "idle") {
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

  if (state.status === "starting") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Loading01 size={24} className="animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Creating VM and starting dev server...
        </p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-sm text-destructive">{state.message}</p>
        <Button variant="outline" onClick={handleStart}>
          Retry
        </Button>
      </div>
    );
  }

  // Terminal or Preview state
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-1">
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
          <button
            type="button"
            onClick={() => setActiveView("preview")}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors",
              activeView === "preview"
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Monitor04 size={14} />
            Preview
            {state.status === "terminal" && (
              <Loading01 size={10} className="animate-spin" />
            )}
          </button>
        </div>
        <Button variant="ghost" size="sm" onClick={handleStop}>
          Stop
        </Button>
      </div>

      <div className="flex-1 relative">
        <iframe
          src={state.terminalUrl}
          className={cn(
            "absolute inset-0 w-full h-full border-0",
            activeView !== "terminal" && "hidden",
          )}
          title="VM Terminal"
        />
        <iframe
          src={state.previewUrl}
          className={cn(
            "absolute inset-0 w-full h-full border-0",
            activeView !== "preview" && "hidden",
          )}
          title="Dev Server Preview"
        />
      </div>
    </div>
  );
}
