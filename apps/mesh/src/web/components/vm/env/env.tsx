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
  Stop,
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
import { useChatBridge } from "@/web/components/chat/context";
import { usePanelActions } from "@/web/layouts/shell-layout";
import { VmErrorState } from "../vm-error-state";
import { VmSuspendedState } from "../vm-suspended-state";
import { useVmEvents } from "../hooks/use-vm-events";
import { VmTerminal } from "./terminal";
import type { Terminal as XTerminal } from "@xterm/xterm";
import { GridLoader } from "../../grid-loader.tsx";
import { EmptyState } from "../../empty-state";
import { CollectionTabs } from "../../collections/collection-tabs";
import { LiveTimer } from "../../live-timer";
import { useActiveGithubRepo } from "@/web/hooks/use-active-github-repo";
import { authClient } from "@/web/lib/auth-client";
import { PACKAGE_MANAGER_CONFIG } from "@/shared/runtime-defaults";
import type { PackageManager } from "@/shared/runtime-defaults";
import { toast } from "sonner";

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

  const vmEvents = useVmEvents(
    status === "running" ? (vmDataRef.current?.previewUrl ?? null) : null,
    handleChunk,
  );

  // When scripts are discovered, auto-open well-known starters
  const scriptsAppliedRef = useRef(false);
  // oxlint-disable-next-line ban-use-effect/ban-use-effect — responds to vmEvents.scripts discovery; drives one-time tab auto-open
  useEffect(() => {
    if (vmEvents.scripts.length === 0) return;

    setOpenScriptTabs((prev) => {
      const next = [...prev];
      for (const script of vmEvents.scripts) {
        if (!next.includes(script)) {
          next.push(script);
        }
      }
      return next;
    });

    if (!scriptsAppliedRef.current) {
      scriptsAppliedRef.current = true;
      const preferredScript =
        WELL_KNOWN_STARTERS.find((name) => vmEvents.scripts.includes(name)) ??
        vmEvents.scripts[0];
      if (preferredScript) {
        setActiveTab(preferredScript);
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
        `${vmDataRef.current.previewUrl}/_decopilot_vm/exec/${scriptName}`,
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
        `${vmDataRef.current.previewUrl}/_decopilot_vm/kill/${scriptName}`,
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
      invalidateVirtualMcpQueries(queryClient);
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
    invalidateVirtualMcpQueries(queryClient);
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
        <GridLoader />
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
  const terminalTabs = allTabs.map((tab) => ({ id: tab, label: tab }));
  const activeScriptTab =
    activeTab !== "setup" &&
    activeTab !== "daemon" &&
    openScriptTabs.includes(activeTab)
      ? activeTab
      : null;
  const activeScriptRunning = activeScriptTab
    ? vmEvents.activeProcesses.includes(activeScriptTab) &&
      !killedProcesses.has(activeScriptTab)
    : false;

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2 md:px-4">
        <div className="min-w-0 flex-1">
          <CollectionTabs
            tabs={terminalTabs}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        </div>

        <div className="flex items-center gap-1">
          {addableScripts.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Add script">
                  <Plus size={14} />
                </Button>
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

          {hasSelection && (
            <Button variant="outline" size="sm" onClick={handleAddToChat}>
              <MessageChatCircle size={12} />
              Add to chat
            </Button>
          )}

          {activeScriptTab && (
            <>
              <Button
                variant={activeScriptRunning ? "outline" : "default"}
                size="sm"
                disabled={execInFlight}
                onClick={() => handleExec(activeScriptTab)}
              >
                {execInFlight ? (
                  <Loading01 size={12} className="animate-spin" />
                ) : (
                  <Play size={12} />
                )}
                {execInFlight
                  ? "Running..."
                  : activeScriptRunning
                    ? "Restart script"
                    : "Run script"}
              </Button>
              {activeScriptRunning && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={execInFlight}
                  onClick={() => handleKill(activeScriptTab)}
                >
                  <Stop size={12} />
                  Stop script
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden bg-sidebar">
        {allTabs.map((tab) => (
          <div key={tab} className={tab === activeTab ? "h-full" : "hidden"}>
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
                className="h-full bg-transparent"
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

      {vmDataRef.current?.vmId && (
        <div className="flex shrink-0 items-center justify-between gap-2 bg-sidebar px-3 py-2 md:px-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="max-w-[220px] font-mono tabular-nums text-muted-foreground"
                onClick={() =>
                  navigator.clipboard.writeText(vmDataRef.current?.vmId ?? "")
                }
              >
                <span className="truncate">{vmDataRef.current.vmId}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Copy VM ID</TooltipContent>
          </Tooltip>

          <Button variant="ghost" size="sm" onClick={handleStop}>
            <Stop size={12} />
            Stop server
          </Button>
        </div>
      )}
    </div>
  );
}
