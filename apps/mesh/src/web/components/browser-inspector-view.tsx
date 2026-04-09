import { useState } from "react";
import { useInsetContext } from "@/web/layouts/shell-layout";
import {
  RefreshCcw01,
  LinkExternal01,
  Play,
  StopCircle,
  Loading01,
  ChevronDown,
} from "@untitledui/icons";
import { Button } from "@deco/ui/components/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@deco/ui/components/dropdown-menu.tsx";
import { parseFreestyleMetadata } from "@/freestyle/parse-metadata";
import {
  SELF_MCP_ALIAS_ID,
  useMCPClient,
  useProjectContext,
} from "@decocms/mesh-sdk";
import { useInvalidateVirtualMcp } from "@/web/hooks/use-invalidate-virtual-mcp";

export function BrowserInspectorView() {
  const ctx = useInsetContext();
  const [refreshKey, setRefreshKey] = useState(0);
  const [starting, setStarting] = useState(false);

  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });
  const invalidateEntity = useInvalidateVirtualMcp();

  const fm = parseFreestyleMetadata(ctx?.entity?.metadata);
  const entityId = ctx?.entity?.id;
  const vmDomain = fm.vm_domain;
  const isRunning = fm.runtime_status === "running" && vmDomain;
  const isInstalling = fm.runtime_status === "installing" || starting;
  const scriptEntries = Object.keys(fm.scripts ?? {});
  const url = vmDomain ? `https://${vmDomain}` : null;

  const handleRunScript = async (script: string) => {
    if (!entityId) return;
    setStarting(true);
    try {
      await client.callTool({
        name: "VIRTUAL_MCP_RUN_SCRIPT",
        arguments: { virtual_mcp_id: entityId, script },
      });
    } catch (e) {
      console.error("Failed to run script:", e);
    } finally {
      invalidateEntity();
      setStarting(false);
    }
  };

  const handleStop = async () => {
    if (!entityId) return;
    try {
      await client.callTool({
        name: "VIRTUAL_MCP_STOP_SCRIPT",
        arguments: { virtual_mcp_id: entityId },
      });
    } catch (e) {
      console.error("Failed to stop script:", e);
    } finally {
      invalidateEntity();
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Toolbar — always visible */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/30 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setRefreshKey((k) => k + 1)}
          disabled={!isRunning}
          className="h-7 w-7 p-0"
        >
          <RefreshCcw01 size={14} />
        </Button>

        {/* URL bar */}
        <div className="flex-1 flex items-center gap-2 px-2 py-0.5 rounded-md bg-muted/50 text-xs text-muted-foreground">
          {isRunning && (
            <span className="size-2 rounded-full bg-green-500 shrink-0" />
          )}
          {isInstalling && (
            <Loading01 size={10} className="animate-spin shrink-0" />
          )}
          <span className="truncate">{url ?? "No server running"}</span>
        </div>

        {/* Right side: play/stop + external link */}
        {isRunning && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleStop}
              className="h-7 w-7 p-0 text-destructive/80 hover:text-destructive"
            >
              <StopCircle size={14} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.open(url!, "_blank", "noopener,noreferrer")}
              className="h-7 w-7 p-0"
            >
              <LinkExternal01 size={14} />
            </Button>
          </>
        )}

        {!isRunning && !isInstalling && scriptEntries.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 gap-1">
                <Play size={12} />
                Run
                <ChevronDown size={12} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {scriptEntries.map((name) => (
                <DropdownMenuItem
                  key={name}
                  onClick={() => handleRunScript(name)}
                >
                  <Play size={12} />
                  {name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Content area */}
      {isRunning && url ? (
        <iframe
          key={refreshKey}
          src={url}
          sandbox="allow-scripts allow-forms allow-popups"
          className="flex-1 w-full border-0"
          title="Browser Inspector"
        />
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-center">
            {isInstalling ? (
              <>
                <Loading01
                  size={32}
                  className="animate-spin text-muted-foreground"
                />
                <p className="text-sm text-muted-foreground">
                  {fm.runtime_status === "installing"
                    ? "Installing dependencies..."
                    : "Starting server..."}
                </p>
              </>
            ) : scriptEntries.length > 0 ? (
              <>
                <div className="flex items-center justify-center size-14 rounded-2xl bg-muted border border-border/60">
                  <Play size={24} className="text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground">
                  Run a {fm.runtime === "deno" ? "task" : "script"} to preview
                </p>
                <p className="text-xs text-muted-foreground">
                  Use the Run button above to start the dev server
                </p>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  No scripts available
                </p>
                <p className="text-xs text-muted-foreground">
                  Link a repository to detect available scripts.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
