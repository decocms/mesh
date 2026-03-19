import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Copy01, RefreshCw05 } from "@untitledui/icons";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@deco/ui/components/dialog.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@deco/ui/components/tabs.tsx";
import { Badge } from "@deco/ui/components/badge.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { useProjectContext } from "@decocms/mesh-sdk";
import { KEYS } from "@/web/lib/query-keys";

type Target = "claude-code" | "cursor" | "codex";

interface ConnectStudioStatus {
  claude: {
    connected: boolean;
    auth?: Record<string, string | undefined> | null;
  };
  cursor: { connected: boolean };
  codex: { connected: boolean };
}

interface ConnectResponse {
  success: boolean;
  config?: unknown;
  configRaw?: string;
}

function isLocalhost() {
  return (
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname === "::1")
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-7 shrink-0"
      onClick={handleCopy}
    >
      {copied ? <Check size={14} /> : <Copy01 size={14} />}
    </Button>
  );
}

function ConfigSnippet({ code, language }: { code: string; language: string }) {
  return (
    <div className="relative rounded-md border border-border bg-muted/50">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
        <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
          {language}
        </span>
        <CopyButton text={code} />
      </div>
      <pre className="p-3 text-xs overflow-x-auto">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function ConnectTab({
  target,
  label,
  connected,
  configSnippet,
  configLanguage,
  configPath,
  onConnect,
  onDisconnect,
  isConnecting,
  isDisconnecting,
  authInfo,
}: {
  target: Target;
  label: string;
  connected: boolean;
  configSnippet: string | null;
  configLanguage: string;
  configPath: string;
  onConnect: (target: Target) => void;
  onDisconnect: (target: Target) => void;
  isConnecting: boolean;
  isDisconnecting: boolean;
  authInfo?: Record<string, string | undefined> | null;
}) {
  const local = isLocalhost();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{label}</span>
          <Badge
            variant={connected ? "default" : "secondary"}
            className="text-[10px]"
          >
            {connected ? "Connected" : "Not connected"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {connected ? (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => onDisconnect(target)}
              disabled={isDisconnecting}
            >
              {isDisconnecting ? "Disconnecting..." : "Disconnect"}
            </Button>
          ) : local ? (
            <Button
              size="sm"
              onClick={() => onConnect(target)}
              disabled={isConnecting}
            >
              {isConnecting ? "Connecting..." : "Connect"}
            </Button>
          ) : null}
        </div>
      </div>

      {connected && authInfo && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          {Object.entries(authInfo)
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k}>
                <span className="capitalize">{k}</span>: {v}
              </div>
            ))}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          {local
            ? `Click "Connect" to auto-configure, or copy the config below into ${configPath}:`
            : `Add this to ${configPath}:`}
        </p>
        {configSnippet ? (
          <ConfigSnippet code={configSnippet} language={configLanguage} />
        ) : (
          <p className="text-xs text-muted-foreground italic">
            {local
              ? "Config will be shown after connecting."
              : "Connect from a local studio to generate a token."}
          </p>
        )}
      </div>
    </div>
  );
}

export function ConnectStudioModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { org } = useProjectContext();
  const queryClient = useQueryClient();
  const [generatedConfigs, setGeneratedConfigs] = useState<
    Partial<Record<Target, string>>
  >({});

  const statusQuery = useQuery<ConnectStudioStatus>({
    queryKey: KEYS.connectStudioStatus(org.slug),
    queryFn: async () => {
      const res = await fetch(
        `/api/${org.slug}/decopilot/connect-studio/status`,
      );
      if (!res.ok) throw new Error("Failed to check status");
      return res.json();
    },
    enabled: open,
    refetchInterval: open ? 10_000 : false,
  });

  const status = statusQuery.data;

  const connectMutation = useMutation({
    mutationFn: async (target: Target) => {
      const res = await fetch(`/api/${org.slug}/decopilot/connect-studio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });
      if (!res.ok) throw new Error("Failed to connect");
      return (await res.json()) as ConnectResponse;
    },
    onSuccess: (data, target) => {
      if (data.configRaw) {
        setGeneratedConfigs((prev) => ({ ...prev, [target]: data.configRaw }));
      }
      if (data.success) {
        toast.success(`Connected to ${targetLabel(target)}`);
      } else {
        toast.info("Token created. Copy the config below to finish setup.");
      }
      queryClient.invalidateQueries({
        queryKey: KEYS.connectStudioStatus(org.slug),
      });
    },
    onError: (err) => {
      toast.error(`Connection failed: ${err.message}`);
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (target: Target) => {
      const res = await fetch(`/api/${org.slug}/decopilot/connect-studio`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });
      if (!res.ok) throw new Error("Failed to disconnect");
      return res.json();
    },
    onSuccess: (_, target) => {
      setGeneratedConfigs((prev) => {
        const next = { ...prev };
        delete next[target];
        return next;
      });
      toast.success(`Disconnected from ${targetLabel(target)}`);
      queryClient.invalidateQueries({
        queryKey: KEYS.connectStudioStatus(org.slug),
      });
    },
    onError: (err) => {
      toast.error(`Disconnect failed: ${err.message}`);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <div className="flex items-center justify-between">
          <DialogTitle className="text-base font-semibold">
            Connect Studio
          </DialogTitle>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() =>
              queryClient.invalidateQueries({
                queryKey: KEYS.connectStudioStatus(org.slug),
              })
            }
          >
            <RefreshCw05
              size={14}
              className={cn(statusQuery.isFetching && "animate-spin")}
            />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          Connect your IDE to this studio so every session has access to all
          your agents and tools.
        </p>

        <Tabs defaultValue="claude-code" className="mt-2">
          <TabsList className="w-full">
            <TabsTrigger value="claude-code" className="flex-1 text-xs">
              Claude Code
            </TabsTrigger>
            <TabsTrigger value="cursor" className="flex-1 text-xs">
              Cursor
            </TabsTrigger>
            <TabsTrigger value="codex" className="flex-1 text-xs">
              Codex
            </TabsTrigger>
          </TabsList>

          <TabsContent value="claude-code" className="mt-4">
            <ConnectTab
              target="claude-code"
              label="Claude Code"
              connected={status?.claude?.connected ?? false}
              configSnippet={generatedConfigs["claude-code"] ?? null}
              configLanguage="JSON"
              configPath="claude mcp add-json --scope user"
              onConnect={(t) => connectMutation.mutate(t)}
              onDisconnect={(t) => disconnectMutation.mutate(t)}
              isConnecting={
                connectMutation.isPending &&
                connectMutation.variables === "claude-code"
              }
              isDisconnecting={
                disconnectMutation.isPending &&
                disconnectMutation.variables === "claude-code"
              }
              authInfo={status?.claude?.auth}
            />
          </TabsContent>

          <TabsContent value="cursor" className="mt-4">
            <ConnectTab
              target="cursor"
              label="Cursor"
              connected={status?.cursor?.connected ?? false}
              configSnippet={generatedConfigs.cursor ?? null}
              configLanguage="JSON"
              configPath="~/.cursor/mcp.json"
              onConnect={(t) => connectMutation.mutate(t)}
              onDisconnect={(t) => disconnectMutation.mutate(t)}
              isConnecting={
                connectMutation.isPending &&
                connectMutation.variables === "cursor"
              }
              isDisconnecting={
                disconnectMutation.isPending &&
                disconnectMutation.variables === "cursor"
              }
            />
          </TabsContent>

          <TabsContent value="codex" className="mt-4">
            <ConnectTab
              target="codex"
              label="Codex"
              connected={status?.codex?.connected ?? false}
              configSnippet={generatedConfigs.codex ?? null}
              configLanguage="TOML"
              configPath="~/.codex/config.toml"
              onConnect={(t) => connectMutation.mutate(t)}
              onDisconnect={(t) => disconnectMutation.mutate(t)}
              isConnecting={
                connectMutation.isPending &&
                connectMutation.variables === "codex"
              }
              isDisconnecting={
                disconnectMutation.isPending &&
                disconnectMutation.variables === "codex"
              }
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function targetLabel(target: Target): string {
  switch (target) {
    case "claude-code":
      return "Claude Code";
    case "cursor":
      return "Cursor";
    case "codex":
      return "Codex";
  }
}
