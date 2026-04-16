import { useState, useRef, useEffect } from "react";
import {
  useProjectContext,
  useMCPClient,
  SELF_MCP_ALIAS_ID,
} from "@decocms/mesh-sdk";
import { useQueryClient } from "@tanstack/react-query";
import { useInsetContext } from "@/web/layouts/agent-shell-layout";
import {
  Loading01,
  Play,
  StopCircle,
  ChevronDown,
  Plus,
  MessageChatCircle,
  LinkExternal01,
} from "@untitledui/icons";
import { Button } from "@deco/ui/components/button.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deco/ui/components/select.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { Label } from "@deco/ui/components/label.tsx";

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
import { useChatBridge } from "@/web/components/chat/context";
import { usePanelActions } from "@/web/layouts/shell-layout";
import { useTerminalSelection } from "@/web/hooks/use-terminal-selection";
import { VmErrorState } from "../vm-error-state";
import { useVmEvents } from "../hooks/use-vm-events";
import { VmTerminal } from "./terminal";
import type { Terminal as XTerminal } from "@xterm/xterm";
import { EmptyState } from "../../empty-state";
import { GitHubRepoPicker } from "../../github-repo-picker";
import { LiveTimer } from "../../live-timer";
import { useActiveGithubRepo } from "@/web/hooks/use-active-github-repo";
import { authClient } from "@/web/lib/auth-client";
import {
  PACKAGE_MANAGER_CONFIG,
  PACKAGE_MANAGER_LABELS,
} from "@/shared/runtime-defaults";
import type { PackageManager } from "@/shared/runtime-defaults";
import { toast } from "sonner";

function GitHubIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

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

const WELL_KNOWN_STARTERS = ["dev", "start"];

export function EnvContent({ daemonOpen = false }: { daemonOpen?: boolean }) {
  const { org } = useProjectContext();
  const inset = useInsetContext();
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();

  // Check if there's already an active VM for this user
  const userId = session?.user?.id;
  const activeVmMetadata = inset?.entity?.metadata as
    | {
        activeVms?: Record<
          string,
          { previewUrl: string; vmId: string; terminalUrl: string | null }
        >;
      }
    | undefined;
  const existingVm = userId ? activeVmMetadata?.activeVms?.[userId] : undefined;

  const [status, setStatus] = useState<ViewStatus>(
    existingVm ? "running" : "idle",
  );
  const [statusLabel, setStatusLabel] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [execInFlight, setExecInFlight] = useState(false);
  const [killedProcesses, setKilledProcesses] = useState<Set<string>>(
    new Set(),
  );
  const vmDataRef = useRef<VmData | null>(
    existingVm
      ? {
          terminalUrl: existingVm.terminalUrl,
          previewUrl: existingVm.previewUrl,
          vmId: existingVm.vmId,
          isNewVm: false,
        }
      : null,
  );
  const startingRef = useRef(false);
  const startedAtRef = useRef<number>(Date.now());

  const [activeTab, setActiveTab] = useState<string>("setup");
  const [openScriptTabs, setOpenScriptTabs] = useState<string[]>([]);
  const terminalRefs = useRef(new Map<string, XTerminal>());

  const { sendMessage } = useChatBridge();
  const { setChatOpen } = usePanelActions();
  const activeTerminal = terminalRefs.current.get(activeTab) ?? null;
  const { hasSelection, getSelectedText } =
    useTerminalSelection(activeTerminal);

  const handleAddToChat = () => {
    const text = getSelectedText();
    if (!text) return;
    setChatOpen(true);
    sendMessage({
      parts: [{ type: "text", text: `<server-logs>\n${text}\n</server-logs>` }],
    });
    activeTerminal?.clearSelection();
  };

  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  const handleChunk = (source: string, data: string) => {
    const term = terminalRefs.current.get(source);
    if (term) {
      term.write(data);
    }
  };

  const vmEvents = useVmEvents(
    status === "running" ? (vmDataRef.current?.previewUrl ?? null) : null,
    handleChunk,
  );

  // When scripts are discovered, auto-open well-known starters
  const scriptsAppliedRef = useRef(false);
  // oxlint-disable-next-line ban-use-effect/ban-use-effect — responds to vmEvents.scripts discovery; drives one-time tab auto-open
  useEffect(() => {
    if (vmEvents.scripts.length > 0 && !scriptsAppliedRef.current) {
      scriptsAppliedRef.current = true;
      // Only add the first well-known starter (matches daemon auto-start behavior)
      for (const name of WELL_KNOWN_STARTERS) {
        if (vmEvents.scripts.includes(name)) {
          setOpenScriptTabs([name]);
          setActiveTab(name);
          break;
        }
      }
    }
  }, [vmEvents.scripts]);

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

  const handleExec = async (scriptName: string) => {
    if (execInFlight || !vmDataRef.current) return;
    setExecInFlight(true);
    try {
      const res = await fetch(
        `${vmDataRef.current.previewUrl}/_daemon/exec/${scriptName}`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error(`Exec failed: ${res.statusText}`);
      setKilledProcesses((prev) => {
        const next = new Set(prev);
        next.delete(scriptName);
        return next;
      });
    } finally {
      setExecInFlight(false);
    }
  };

  const handleKill = async (scriptName: string) => {
    if (execInFlight || !vmDataRef.current) return;
    setExecInFlight(true);
    try {
      const res = await fetch(
        `${vmDataRef.current.previewUrl}/_daemon/kill/${scriptName}`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error(`Kill failed: ${res.statusText}`);
      setKilledProcesses((prev) => new Set(prev).add(scriptName));
    } finally {
      setExecInFlight(false);
    }
  };

  const handleAddScript = (scriptName: string) => {
    if (!openScriptTabs.includes(scriptName)) {
      setOpenScriptTabs((prev) => [...prev, scriptName]);
    }
    setActiveTab(scriptName);
    handleExec(scriptName);
  };

  const handleStart = async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    startedAtRef.current = Date.now();
    setStatus("creating");
    setStatusLabel("Connecting...");
    setErrorMsg("");
    scriptsAppliedRef.current = false;
    setOpenScriptTabs([]);
    setActiveTab("setup");

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
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return key[3] === "collection" && key[4] === "VIRTUAL_MCP";
        },
      });
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
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey;
        return key[3] === "collection" && key[4] === "VIRTUAL_MCP";
      },
    });
  };

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

  const githubRepo = useActiveGithubRepo();

  // State 1: No repo connected — show empty state with dialog trigger
  const [pickerOpen, setPickerOpen] = useState(false);

  if (!githubRepo) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full gap-4 p-6">
        <GitHubIcon size={48} />
        <h3 className="text-lg font-medium">Connect a GitHub repository</h3>
        <p className="text-sm text-muted-foreground text-center max-w-sm">
          Connect a repository to start your development environment.
        </p>
        <Button variant="outline" onClick={() => setPickerOpen(true)}>
          <GitHubIcon size={16} />
          Connect GitHub
        </Button>
        <GitHubRepoPicker open={pickerOpen} onOpenChange={setPickerOpen} />
      </div>
    );
  }

  const runtime = (
    inset?.entity?.metadata as
      | { runtime?: { selected: string | null; port?: string | null } | null }
      | undefined
  )?.runtime;
  const isDetecting = runtime === undefined;
  const NONE_VALUE = "__none__";
  const packageManagers = Object.keys(
    PACKAGE_MANAGER_CONFIG,
  ) as PackageManager[];

  const handleFieldUpdate = async (
    field: "selected" | "port",
    value: string | null,
  ) => {
    if (!inset?.entity) return;
    try {
      await client.callTool({
        name: "COLLECTION_VIRTUAL_MCP_UPDATE",
        arguments: {
          id: inset.entity.id,
          data: {
            metadata: {
              runtime: {
                ...runtime,
                [field]: value,
              },
            },
          },
        },
      });
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return key[3] === "collection" && key[4] === "VIRTUAL_MCP";
        },
      });
    } catch {
      toast.error("Failed to update setting");
    }
  };

  // State 2: Repo connected, VM stopped — show config + Start
  if (status === "idle" || status === "stopping") {
    const isStopping = status === "stopping";
    return (
      <div className="flex flex-col items-center justify-center w-full h-full p-6">
        <div className="flex flex-col gap-4 w-full max-w-xs">
          <a
            href={`https://github.com/${githubRepo.owner}/${githubRepo.name}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-4 rounded-lg border border-border hover:bg-accent/50 transition-colors"
          >
            <GitHubIcon size={24} />
            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
              <span className="text-sm font-medium truncate">
                {githubRepo.owner}/{githubRepo.name}
              </span>
              <span className="text-xs text-muted-foreground truncate">
                github.com/{githubRepo.owner}/{githubRepo.name}
              </span>
            </div>
            <LinkExternal01
              size={14}
              className="text-muted-foreground shrink-0"
            />
          </a>

          {isDetecting ? (
            <div className="flex items-center justify-center gap-2 w-full">
              <Loading01
                size={14}
                className="animate-spin text-muted-foreground"
              />
              <p className="text-sm text-muted-foreground">
                Detecting project configuration...
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap items-end justify-between gap-2 w-full">
              <div className="flex flex-col gap-1">
                <Label htmlFor="env-runtime" className="text-xs font-medium">
                  Runtime
                </Label>
                <Select
                  value={runtime?.selected ?? NONE_VALUE}
                  onValueChange={(v) =>
                    handleFieldUpdate("selected", v === NONE_VALUE ? null : v)
                  }
                >
                  <SelectTrigger id="env-runtime" className="w-28">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>None</SelectItem>
                    {packageManagers.map((pm) => (
                      <SelectItem key={pm} value={pm}>
                        {PACKAGE_MANAGER_LABELS[pm]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="env-port" className="text-xs font-medium">
                  Port
                </Label>
                <Input
                  id="env-port"
                  placeholder="3000"
                  className="w-20 h-8"
                  defaultValue={runtime?.port ?? ""}
                  onBlur={(e) =>
                    handleFieldUpdate("port", e.target.value || null)
                  }
                />
              </div>
              <Button
                onClick={handleStart}
                disabled={isStopping || isDetecting}
              >
                {isStopping ? (
                  <Loading01 size={14} className="animate-spin" />
                ) : (
                  <Play size={14} />
                )}
                {isStopping ? "Stopping..." : "Run"}
              </Button>
            </div>
          )}
        </div>
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
    return <VmErrorState errorMsg={errorMsg} onRetry={handleStart} />;
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

  // All tabs: setup + open script tabs + optional daemon
  const allTabs = [
    "setup",
    ...openScriptTabs,
    ...(daemonOpen ? ["daemon"] : []),
  ];

  // Scripts available to add (not already open)
  const addableScripts = vmEvents.scripts.filter(
    (s) => !openScriptTabs.includes(s),
  );

  return (
    <div className="flex flex-col w-full h-full">
      <div className="flex flex-col h-full">
        {/* Terminal tabs + action bar */}
        <div className="flex items-center border-b border-border px-2 shrink-0">
          {allTabs.map((tab) => (
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

          {/* Add script button */}
          {addableScripts.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Plus size={14} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {addableScripts.map((script) => (
                  <DropdownMenuItem
                    key={script}
                    onClick={() => handleAddScript(script)}
                  >
                    {script}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

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

          {/* Script tab controls (not for setup/daemon) */}
          <div className="flex items-center gap-1">
            {hasSelection && (
              <button
                type="button"
                onClick={handleAddToChat}
                className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <MessageChatCircle size={12} />
                Add to chat
              </button>
            )}
            {activeTab !== "setup" &&
              activeTab !== "daemon" &&
              openScriptTabs.includes(activeTab) &&
              (() => {
                const isRunning =
                  vmEvents.activeProcesses.includes(activeTab) &&
                  !killedProcesses.has(activeTab);
                return (
                  <div className="flex items-center">
                    <button
                      type="button"
                      disabled={execInFlight}
                      onClick={() => handleExec(activeTab)}
                      className={cn(
                        "flex items-center gap-1 border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50",
                        isRunning ? "rounded-l-md border-r-0" : "rounded-md",
                      )}
                    >
                      {execInFlight ? (
                        <Loading01 size={12} className="animate-spin" />
                      ) : (
                        <Play size={12} />
                      )}
                      {execInFlight
                        ? "Running..."
                        : isRunning
                          ? "Restart"
                          : "Run"}
                    </button>
                    {isRunning && (
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
          {allTabs.map((tab) => (
            <div
              key={tab}
              className={cn("h-full", activeTab === tab ? "block" : "hidden")}
            >
              {vmEvents.hasData(tab) || tab === "setup" || tab === "daemon" ? (
                <VmTerminal
                  onReady={(t) => {
                    terminalRefs.current.set(tab, t);
                  }}
                  initialData={vmEvents.getBuffer(tab)}
                  className="h-full"
                />
              ) : (
                <EmptyState
                  className="h-full"
                  image={null}
                  title={`Script "${tab}" not running`}
                  description={`Click Run to start "${tab}".`}
                  actions={
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={execInFlight}
                      onClick={() => handleExec(tab)}
                    >
                      {execInFlight ? (
                        <Loading01 size={14} className="animate-spin" />
                      ) : (
                        <Play size={14} />
                      )}
                      Run
                    </Button>
                  }
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
