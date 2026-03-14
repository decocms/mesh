import { Button } from "@deco/ui/components/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@deco/ui/components/dialog.tsx";
import { useProjectContext } from "@decocms/mesh-sdk";
import { Check, Loading01 } from "@untitledui/icons";
import { useState } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@deco/ui/lib/utils.ts";

interface ConnectionStatus {
  connected: boolean;
  auth: Record<string, string | undefined> | null;
}

interface ConnectStudioStatus {
  claude: ConnectionStatus;
}

const CONNECT_STUDIO_QK = "connect-studio-status";

function useConnectStudioStatus(org: { slug: string }) {
  return useQuery<ConnectStudioStatus>({
    queryKey: [CONNECT_STUDIO_QK, org.slug],
    queryFn: async () => {
      const res = await fetch(
        `/api/${org.slug}/decopilot/connect-studio/status`,
      );
      if (!res.ok) throw new Error("Failed to fetch status");
      return res.json();
    },
  });
}

function ConnectionCard({
  target,
  logo,
  name,
  status,
  isLoading,
  orgSlug,
}: {
  target: string;
  logo: React.ReactNode;
  name: string;
  status: ConnectionStatus | undefined;
  isLoading: boolean;
  orgSlug: string;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const connected = status?.connected ?? false;
  const auth = status?.auth;

  const handleToggle = async () => {
    setBusy(true);
    const method = connected ? "DELETE" : "POST";
    try {
      const res = await fetch(`/api/${orgSlug}/decopilot/connect-studio`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(err.error ?? "Failed");
      }
      toast.success(connected ? `Disconnected ${name}` : `Connected ${name}!`);
      queryClient.invalidateQueries({ queryKey: [CONNECT_STUDIO_QK] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const authLine = auth
    ? Object.values(auth).filter(Boolean).join(" — ")
    : null;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border px-3 py-2.5",
        connected ? "border-green-200 bg-green-50" : "border-border",
      )}
    >
      <div className="h-5 w-5 shrink-0 flex items-center justify-center">
        {logo}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium">{name}</span>
          {connected && <Check size={14} className="text-green-600 shrink-0" />}
        </div>
        {authLine && (
          <p className="text-xs text-muted-foreground truncate">{authLine}</p>
        )}
      </div>
      {isLoading ? (
        <Loading01
          size={14}
          className="animate-spin text-muted-foreground shrink-0"
        />
      ) : (
        <Button
          variant={connected ? "ghost" : "outline"}
          size="sm"
          className={cn(
            "shrink-0 h-7 text-xs",
            connected && "text-muted-foreground hover:text-destructive",
          )}
          onClick={handleToggle}
          disabled={busy}
        >
          {busy ? (
            <Loading01 size={12} className="animate-spin" />
          ) : connected ? (
            "Disconnect"
          ) : (
            "Connect"
          )}
        </Button>
      )}
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
  const { data: status, isLoading } = useConnectStudioStatus(org);
  const queryClient = useQueryClient();

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (v) {
          queryClient.invalidateQueries({
            queryKey: [CONNECT_STUDIO_QK, org.slug],
          });
        }
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Connect Studio</DialogTitle>
          <DialogDescription>
            Install studio tools into your local dev environment.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 pt-1">
          <ConnectionCard
            target="claude-code"
            name="Claude Code"
            logo={
              <img
                src="/logos/Claude Code.svg"
                alt="Claude Code"
                className="h-5 w-5"
                style={{
                  filter:
                    "brightness(0) saturate(100%) invert(55%) sepia(31%) saturate(1264%) hue-rotate(331deg) brightness(92%) contrast(86%)",
                }}
              />
            }
            status={status?.claude}
            isLoading={isLoading}
            orgSlug={org.slug}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
