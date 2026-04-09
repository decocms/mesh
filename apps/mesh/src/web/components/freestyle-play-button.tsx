import { useState } from "react";
import {
  SELF_MCP_ALIAS_ID,
  useMCPClient,
  useProjectContext,
} from "@decocms/mesh-sdk";
import type { VirtualMCPEntity } from "@decocms/mesh-sdk/types";
import {
  Play,
  StopCircle,
  Loading01,
  Globe01,
  ChevronDown,
} from "@untitledui/icons";
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
import { parseFreestyleMetadata } from "@/freestyle/parse-metadata";
import { useInvalidateVirtualMcp } from "@/web/hooks/use-invalidate-virtual-mcp";

interface FreestylePlayButtonProps {
  entity: VirtualMCPEntity;
  onOpenBrowser?: (domain: string) => void;
}

export function FreestylePlayButton({
  entity,
  onOpenBrowser,
}: FreestylePlayButtonProps) {
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  const [loading, setLoading] = useState(false);
  const invalidateEntity = useInvalidateVirtualMcp();

  const fm = parseFreestyleMetadata(entity.metadata);
  const repoUrl = fm.repo_url;
  const runtimeStatus = fm.runtime_status;
  const scripts = fm.scripts;
  const runningScript = fm.running_script;
  const vmDomain = fm.vm_domain;

  if (!repoUrl) return null;

  const scriptEntries = Object.keys(scripts ?? {});

  const handleRunScript = async (script: string) => {
    setLoading(true);
    try {
      await client.callTool({
        name: "VIRTUAL_MCP_RUN_SCRIPT",
        arguments: {
          virtual_mcp_id: entity.id,
          script,
        },
      });
    } catch (e) {
      console.error("Failed to run script:", e);
    } finally {
      invalidateEntity();
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      await client.callTool({
        name: "VIRTUAL_MCP_STOP_SCRIPT",
        arguments: {
          virtual_mcp_id: entity.id,
        },
      });
    } catch (e) {
      console.error("Failed to stop script:", e);
    } finally {
      invalidateEntity();
      setLoading(false);
    }
  };

  if (runtimeStatus === "installing" || loading) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground">
        <Loading01 size={14} className="animate-spin" />
        <span>
          {runtimeStatus === "installing" ? "Installing..." : "Loading..."}
        </span>
      </div>
    );
  }

  if (runtimeStatus === "running") {
    return (
      <div className="flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleStop}
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-destructive/80 hover:bg-sidebar-accent hover:text-destructive transition-colors"
            >
              <StopCircle size={16} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Stop {runningScript}</TooltipContent>
        </Tooltip>
        {vmDomain && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onOpenBrowser?.(vmDomain)}
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
              >
                <Globe01 size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Open in browser</TooltipContent>
          </Tooltip>
        )}
      </div>
    );
  }

  // idle state — play dropdown
  if (scriptEntries.length === 0) {
    return null;
  }

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-0.5 h-7 px-1.5 rounded-md text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
            >
              <Play size={14} />
              <ChevronDown size={12} />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Run script</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        {scriptEntries.map((name) => (
          <DropdownMenuItem key={name} onClick={() => handleRunScript(name)}>
            <Play size={14} />
            {name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
