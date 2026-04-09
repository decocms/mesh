import { useState } from "react";
import { useInsetContext } from "@/web/layouts/shell-layout";
import {
  RefreshCcw01,
  Globe01,
  LinkExternal01,
  Play,
  StopCircle,
  Loading01,
} from "@untitledui/icons";
import { Button } from "@deco/ui/components/button.tsx";
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

  const fm = parseFreestyleMetadata(ctx?.entity?.metadata);
  const vmDomain = fm.vm_domain;

  if (!vmDomain) {
    return <PreviewEmptyState />;
  }

  const url = `https://${vmDomain}`;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <PreviewToolbar url={url} onRefresh={() => setRefreshKey((k) => k + 1)} />
      <iframe
        key={refreshKey}
        src={url}
        sandbox="allow-scripts allow-forms allow-popups"
        className="flex-1 w-full border-0"
        title="Browser Inspector"
      />
    </div>
  );
}

function PreviewToolbar({
  url,
  onRefresh,
}: {
  url: string;
  onRefresh: () => void;
}) {
  const ctx = useInsetContext();
  const fm = parseFreestyleMetadata(ctx?.entity?.metadata);
  const entityId = ctx?.entity?.id;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/30">
      <Button
        variant="ghost"
        size="sm"
        onClick={onRefresh}
        className="h-7 w-7 p-0"
      >
        <RefreshCcw01 size={14} />
      </Button>
      <div className="flex-1 flex items-center gap-2 px-2 py-0.5 rounded-md bg-muted/50 text-xs text-muted-foreground">
        <span className="size-2 rounded-full bg-green-500 shrink-0" />
        <span className="truncate">{url}</span>
      </div>
      {fm.runtime_status === "running" && entityId && (
        <StopButton entityId={entityId} />
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
        className="h-7 w-7 p-0"
      >
        <LinkExternal01 size={14} />
      </Button>
    </div>
  );
}

function StopButton({ entityId }: { entityId: string }) {
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });
  const invalidateEntity = useInvalidateVirtualMcp();
  const [stopping, setStopping] = useState(false);

  const handleStop = async () => {
    setStopping(true);
    try {
      await client.callTool({
        name: "VIRTUAL_MCP_STOP_SCRIPT",
        arguments: { virtual_mcp_id: entityId },
      });
    } catch (e) {
      console.error("Failed to stop script:", e);
    } finally {
      invalidateEntity();
      setStopping(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleStop}
      disabled={stopping}
      className="h-7 w-7 p-0 text-destructive/80 hover:text-destructive"
    >
      {stopping ? (
        <Loading01 size={14} className="animate-spin" />
      ) : (
        <StopCircle size={14} />
      )}
    </Button>
  );
}

function PreviewEmptyState() {
  const ctx = useInsetContext();
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });
  const invalidateEntity = useInvalidateVirtualMcp();
  const [loading, setLoading] = useState(false);

  const fm = parseFreestyleMetadata(ctx?.entity?.metadata);
  const entityId = ctx?.entity?.id;
  const scripts = fm.scripts;
  const runtimeStatus = fm.runtime_status;
  const scriptEntries = Object.keys(scripts ?? {});

  const handleRunScript = async (script: string) => {
    if (!entityId) return;
    setLoading(true);
    try {
      await client.callTool({
        name: "VIRTUAL_MCP_RUN_SCRIPT",
        arguments: { virtual_mcp_id: entityId, script },
      });
    } catch (e) {
      console.error("Failed to run script:", e);
    } finally {
      invalidateEntity();
      setLoading(false);
    }
  };

  if (runtimeStatus === "installing" || loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <div className="flex flex-col items-center gap-3">
          <Loading01 size={32} className="animate-spin" />
          <p className="text-sm">
            {runtimeStatus === "installing"
              ? "Installing dependencies..."
              : "Starting server..."}
          </p>
        </div>
      </div>
    );
  }

  if (scriptEntries.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <div className="flex flex-col items-center gap-2">
          <Globe01 size={32} />
          <p className="text-sm">No scripts available</p>
          <p className="text-xs">
            Link a repository to detect available scripts.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="flex items-center justify-center size-14 rounded-2xl bg-muted border border-border/60">
          <Play size={24} className="text-muted-foreground" />
        </div>
        <div className="space-y-2 text-center">
          <p className="text-sm font-medium text-foreground">
            Run a {fm.runtime === "deno" ? "task" : "script"}
          </p>
          <p className="text-xs text-muted-foreground">
            Pick a {fm.runtime === "deno" ? "task" : "script"} to start the dev
            server
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {scriptEntries.map((name) => (
            <Button
              key={name}
              variant="outline"
              size="sm"
              onClick={() => handleRunScript(name)}
            >
              <Play size={12} />
              {name}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
