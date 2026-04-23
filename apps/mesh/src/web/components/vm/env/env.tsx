import { useState, useRef, useEffect } from "react";
import { GitHubIcon } from "@/web/components/icons/github-icon";
import {
  useProjectContext,
  useMCPClient,
  SELF_MCP_ALIAS_ID,
} from "@decocms/mesh-sdk";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateVirtualMcpQueries } from "@/web/lib/query-keys";
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
import { VmErrorState } from "../vm-error-state";
import { VmSuspendedState } from "../vm-suspended-state";
import { useVmEvents } from "../hooks/use-vm-events";
import { VmTerminal } from "./terminal";
import type { Terminal as XTerminal } from "@xterm/xterm";
import { EmptyState } from "../../empty-state";
import { LiveTimer } from "../../live-timer";
import { useActiveGithubRepo } from "@/web/hooks/use-active-github-repo";
import { authClient } from "@/web/lib/auth-client";
import { useChatNavigation } from "@/web/components/chat/hooks/use-chat-navigation";
import { PACKAGE_MANAGER_CONFIG } from "@/shared/runtime-defaults";
import type { PackageManager } from "@/shared/runtime-defaults";
import { toast } from "sonner";

interface VmData {
  previewUrl: string;
  vmId: string;
  branch: string;
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

  // Check if there's already a VM for (this user, this thread's branch).
  const { branch: urlBranch, setBranch } = useChatNavigation();
  const userId = session?.user?.id;
  const vmMapMetadata = inset?.entity?.metadata as
    | {
        vmMap?: Record<
          string,
          Record<string, { previewUrl: string; vmId: string }>
        >;
      }
    | undefined;
  const existingVm =
    userId && urlBranch
      ? vmMapMetadata?.vmMap?.[userId]?.[urlBranch]
      : undefined;

  // Derived VM data — reflects the latest vmMap from the query cache. Any
  // vmMap update (from handleStart, handleStop, or the layout-level auto-
  // start) triggers a re-render with the fresh value here.
  const vmData: VmData | null =
    existingVm && urlBranch
      ? {
          previewUrl: existingVm.previewUrl,
          vmId: existingVm.vmId,
          branch: urlBranch,
          isNewVm: false,
        }
      : null;

  // Transient override used during user-initiated transitions
  // ("creating" / "stopping" / "error"). Cleared via effect below once the
  // derived status catches up.
  const [override, setOverride] = useState<ViewStatus | null>(null);

  const [statusLabel, setStatusLabel] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [execInFlight, setExecInFlight] = useState(false);
  const [killedProcesses, setKilledProcesses] = useState<Set<string>>(
    new Set(),
  );
  const startingRef = useRef(false);
  const startedAtRef = useRef<number>(Date.now());

  const [activeTab, setActiveTabRaw] = useState<string>("setup");
  const [openScriptTabs, setOpenScriptTabs] = useState<string[]>([]);
  const terminalRefs = useRef(new Map<string, XTerminal>());

  const { sendMessage } = useChatBridge();
  const { setChatOpen } = usePanelActions();

  const [hasSelection, setHasSelection] = useState(false);
  const getSelectedTextRef = useRef<(() => string) | null>(null);

  const setActiveTab = (tab: string) => {
    setActiveTabRaw(tab);
    setHasSelection(false);
    getSelectedTextRef.current = null;
  };

  const handleSelectionChange = (
    tab: string,
    has: boolean,
    getText: () => string,
  ) => {
    if (tab !== activeTab) return;
    setHasSelection(has);
    getSelectedTextRef.current = has ? getText : null;
  };

  const handleAddToChat = () => {
    const text = getSelectedTextRef.current?.();
    if (!text) return;
    setChatOpen(true);
    sendMessage({
      parts: [{ type: "text", text: `<server-logs>\n${text}\n</server-logs>` }],
    });
    const activeTerminal = terminalRefs.current.get(activeTab);
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

  // Subscribe to the VM's SSE stream whenever vmData is known — covers both
  // "running" and "suspended" (which is derived from the SSE disconnect). The
  // stream auto-reconnects on URL change, so switching branches just works.
  const vmEvents = useVmEvents(vmData?.previewUrl ?? null, handleChunk);

  // Final status = user-initiated override, else derived from (vmData, SSE).
  const derivedStatus: ViewStatus = vmEvents.suspended
    ? "suspended"
    : vmData
      ? "running"
      : "idle";
  const status: ViewStatus = override ?? derivedStatus;

  // Clear the override when the derived state catches up. E.g. after
  // handleStart → "creating" stays until vmMap invalidation refetches and
  // vmData becomes non-null ("running"); after handleStop → "stopping" stays
  // until vmMap refetch removes the entry ("idle").
  // oxlint-disable-next-line ban-use-effect/ban-use-effect — clears transient override once derivedStatus catches up; no render-time equivalent for "wait for external async state to reach a target"
  useEffect(() => {
    if (override === "creating" && derivedStatus === "running") {
      setOverride(null);
    }
    if (override === "stopping" && derivedStatus === "idle") {
      setOverride(null);
    }
  }, [derivedStatus, override]);

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
    if (execInFlight || !vmData) return;
    setExecInFlight(true);
    try {
      const res = await fetch(
        `${vmData.previewUrl}/_decopilot_vm/exec/${scriptName}`,
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
    if (execInFlight || !vmData) return;
    setExecInFlight(true);
    try {
      const res = await fetch(
        `${vmData.previewUrl}/_decopilot_vm/kill/${scriptName}`,
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
    setOverride("creating");
    setStatusLabel("Connecting...");
    setErrorMsg("");
    scriptsAppliedRef.current = false;
    setOpenScriptTabs([]);
    setActiveTab("setup");

    try {
      if (!inset?.entity) throw new Error("No virtual MCP context");
      const args: { virtualMcpId: string; branch?: string } = {
        virtualMcpId: inset.entity.id,
      };
      if (urlBranch) args.branch = urlBranch;
      const data = (await callTool("VM_START", args)) as VmData;

      if (!data.previewUrl || !data.vmId || !data.branch) {
        throw new Error("Invalid VM response — missing fields");
      }

      // If the server generated a branch (we didn't pass one), persist it
      // to the URL so subsequent renders find the vm via vmMap[userId][branch].
      if (!urlBranch) {
        setBranch(data.branch);
      }
      setStatusLabel("");
      invalidateVirtualMcpQueries(queryClient);
      // override stays "creating" until the vmMap refetch populates vmData,
      // at which point the sync-effect above flips it to null → derivedStatus
      // takes over as "running".
    } catch (error) {
      setOverride("error");
      setErrorMsg(
        error instanceof Error ? error.message : "Failed to start VM",
      );
    } finally {
      startingRef.current = false;
    }
  };

  const handleStop = async () => {
    const branchToStop = vmData?.branch ?? urlBranch;
    setOverride("stopping");

    const virtualMcpId = inset?.entity?.id;
    if (virtualMcpId && branchToStop) {
      try {
        await client.callTool({
          name: "VM_DELETE",
          arguments: { virtualMcpId, branch: branchToStop },
        });
      } catch {
        // Best effort
      }
    }

    invalidateVirtualMcpQueries(queryClient);
    // override stays "stopping" until the vmMap refetch removes the entry,
    // at which point the sync-effect above flips it to null → derivedStatus
    // takes over as "idle".
  };

  const githubRepo = useActiveGithubRepo();

  if (!githubRepo) {
    return null;
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
      invalidateVirtualMcpQueries(queryClient);
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
                        {pm}
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
    return <VmSuspendedState onResume={handleStart} />;
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
        <div className="flex h-10 items-center border-b border-border px-2 shrink-0">
          {allTabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={cn(
                "flex items-center h-full px-3 text-sm whitespace-nowrap border-b-2 mb-[-1px] capitalize transition-all hover:text-foreground",
                activeTab === tab
                  ? "text-foreground border-primary"
                  : "text-muted-foreground border-transparent",
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
                  className="flex items-center h-full px-2 text-muted-foreground hover:text-foreground transition-colors"
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
            {vmData?.vmId && (
              <div className="flex items-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="shrink-0 rounded-l bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground cursor-pointer hover:bg-accent hover:text-foreground transition-colors border-r border-border/50"
                      onClick={() =>
                        navigator.clipboard.writeText(vmData?.vmId ?? "")
                      }
                    >
                      {vmData.vmId}
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
                  onSelectionChange={(has, getText) =>
                    handleSelectionChange(tab, has, getText)
                  }
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
