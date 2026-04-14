import { useState, useRef, useEffect } from "react";
import {
  useProjectContext,
  useMCPClient,
  SELF_MCP_ALIAS_ID,
} from "@decocms/mesh-sdk";
import { useInsetContext } from "@/web/layouts/agent-shell-layout";
import {
  Loading01,
  Play,
  StopCircle,
  Monitor04,
  ChevronDown,
} from "@untitledui/icons";
import { Button } from "@deco/ui/components/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@deco/ui/components/dropdown-menu.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { useVmEvents } from "../hooks/use-vm-events";
import { VmTerminal } from "./terminal";
import type { Terminal as XTerminal } from "@xterm/xterm";
import { EmptyState } from "../../empty-state";
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

export function EnvContent({ daemonOpen = false }: { daemonOpen?: boolean }) {
  const { org } = useProjectContext();
  const inset = useInsetContext();
  const [status, setStatus] = useState<ViewStatus>("idle");
  const [statusLabel, setStatusLabel] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [execInFlight, setExecInFlight] = useState(false);
  const [killedProcesses, setKilledProcesses] = useState<
    Set<"install" | "dev">
  >(new Set());
  const vmDataRef = useRef<VmData | null>(null);
  const startingRef = useRef(false);
  const startedAtRef = useRef<number>(Date.now());

  const [activeTab, setActiveTab] = useState<
    "setup" | "install" | "dev" | "daemon"
  >("dev");
  const installTermRef = useRef<XTerminal | null>(null);
  const devTermRef = useRef<XTerminal | null>(null);
  const setupTermRef = useRef<XTerminal | null>(null);
  const daemonTermRef = useRef<XTerminal | null>(null);

  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  const handleChunk = (source: "install" | "dev" | "daemon", data: string) => {
    if (source === "install") {
      installTermRef.current?.write(data);
      setupTermRef.current?.write(data);
    } else if (source === "dev") {
      devTermRef.current?.write(data);
      setupTermRef.current?.write(data);
    } else if (source === "daemon") {
      daemonTermRef.current?.write(data);
    }
  };

  const vmEvents = useVmEvents(
    status === "running" ? (vmDataRef.current?.previewUrl ?? null) : null,
    handleChunk,
  );

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
      setKilledProcesses((prev) => {
        const next = new Set(prev);
        next.delete(action);
        return next;
      });
    } finally {
      setExecInFlight(false);
    }
  };

  const handleKill = async (source: "install" | "dev") => {
    if (execInFlight || !vmDataRef.current) return;
    setExecInFlight(true);
    try {
      const res = await fetch(
        `${vmDataRef.current.previewUrl}/_daemon/kill/${source}`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error(`Kill failed: ${res.statusText}`);
      setKilledProcesses((prev) => new Set(prev).add(source));
    } finally {
      setExecInFlight(false);
    }
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

      if (!data.isNewVm) {
        return;
      }

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

  const handleStop = async () => {
    vmDataRef.current = null;
    setStatus("stopping");

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

  const handleStartRef = useRef(handleStart);
  handleStartRef.current = handleStart;

  // oxlint-disable-next-line ban-use-effect/ban-use-effect — auto-start on mount requires DOM lifecycle; no React 19 alternative
  useEffect(() => {
    if (inset?.entity?.id) {
      handleStartRef.current();
    }
  }, [inset?.entity?.id]);

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

  if (status === "idle" || status === "stopping") {
    const isStopping = status === "stopping";
    return (
      <div className="flex flex-col items-center justify-center w-full h-full gap-4">
        <Monitor04 size={48} className="text-muted-foreground/40" />
        <h3 className="text-lg font-medium">Server</h3>
        <p className="text-sm text-muted-foreground text-center max-w-sm">
          Start the development server
        </p>
        <Button onClick={handleStart} disabled={isStopping}>
          {isStopping && <Loading01 size={14} className="animate-spin" />}
          {isStopping ? "Stopping..." : "Start Server"}
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

  if (status === "suspended") {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full gap-4">
        <p className="text-sm text-muted-foreground">
          VM suspended due to inactivity.
        </p>
        <Button onClick={() => setStatus("running")}>Resume</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-full">
      <div className="flex flex-col h-full">
        {/* Terminal tabs + action bar */}
        <div className="flex items-center border-b border-border px-2 shrink-0">
          {(
            [
              "setup",
              "install",
              "dev",
              ...(daemonOpen ? (["daemon"] as const) : []),
            ] as const
          ).map((tab) => (
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
          <div className="flex-1 flex justify-center">
            {vmDataRef.current?.vmId && (
              <div className="flex items-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="shrink-0 rounded-l bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground cursor-pointer hover:bg-accent hover:text-foreground transition-colors border-r border-border/50"
                      onClick={() =>
                        navigator.clipboard.writeText(
                          vmDataRef.current?.vmId ?? "",
                        )
                      }
                    >
                      {vmDataRef.current.vmId}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Copy VM ID</TooltipContent>
                </Tooltip>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="shrink-0 self-stretch rounded-r bg-muted px-0.5 text-[10px] text-muted-foreground cursor-pointer hover:bg-accent hover:text-foreground transition-colors"
                    >
                      <ChevronDown size={10} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="center">
                    <DropdownMenuItem onClick={handleStop}>
                      <StopCircle size={12} />
                      Stop Server
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            {(activeTab === "install" || activeTab === "dev") &&
              (() => {
                const hasProcess =
                  ((activeTab === "dev" && vmEvents.hasDevData) ||
                    (activeTab === "install" && vmEvents.hasInstallData)) &&
                  !killedProcesses.has(activeTab);
                return (
                  <div className="flex items-center">
                    <button
                      type="button"
                      disabled={execInFlight}
                      onClick={() => handleExec(activeTab)}
                      className={cn(
                        "flex items-center gap-1 border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50",
                        hasProcess ? "rounded-l-md border-r-0" : "rounded-md",
                      )}
                    >
                      {execInFlight ? (
                        <Loading01 size={12} className="animate-spin" />
                      ) : (
                        <Play size={12} />
                      )}
                      {execInFlight
                        ? "Running..."
                        : activeTab === "install"
                          ? killedProcesses.has("install") ||
                            !vmEvents.hasInstallData
                            ? "Install"
                            : "Re-install"
                          : killedProcesses.has("dev") || !vmEvents.hasDevData
                            ? "Run Process"
                            : "Restart Process"}
                    </button>
                    {hasProcess && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            disabled={execInFlight}
                            className="flex items-center self-stretch rounded-r-md border border-border px-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                          >
                            <ChevronDown size={12} />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleKill(activeTab)}
                          >
                            <StopCircle size={12} />
                            Stop Process
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                );
              })()}
          </div>
        </div>

        {/* Terminal content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === "setup" && (
            <VmTerminal
              onReady={(t) => {
                setupTermRef.current = t;
              }}
              initialData={
                vmEvents.getInstallBuffer() + vmEvents.getDevBuffer()
              }
              className="h-full"
            />
          )}
          {activeTab === "install" &&
            (vmEvents.hasInstallData ? (
              <VmTerminal
                onReady={(t) => {
                  installTermRef.current = t;
                }}
                initialData={vmEvents.getInstallBuffer()}
                className="h-full"
              />
            ) : (
              <EmptyState
                className="h-full"
                image={null}
                title="Dependencies not installed"
                description="Install dependencies to set up your server."
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
            (vmEvents.hasDevData ? (
              <VmTerminal
                onReady={(t) => {
                  devTermRef.current = t;
                }}
                initialData={vmEvents.getDevBuffer()}
                className="h-full"
              />
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
          {activeTab === "daemon" && (
            <VmTerminal
              onReady={(t) => {
                daemonTermRef.current = t;
              }}
              initialData={vmEvents.getDaemonBuffer()}
              className="h-full"
            />
          )}
        </div>
      </div>
    </div>
  );
}
