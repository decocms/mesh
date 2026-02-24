import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Loader2 } from "lucide-react";
import {
  isConnectionAuthenticated,
  type ConnectionEntity,
} from "@decocms/mesh-sdk";
import { Button } from "@deco/ui/components/button.tsx";
import { KEYS } from "@/web/lib/query-keys";
import { useSlotResolution, type ConnectionSlot } from "./use-slot-resolution";
import { useConnectionPoller } from "./use-connection-poller";
import { type SlotPhase } from "./slot-resolution";
import { SlotDone } from "./slot-done";
import { SlotInstallForm } from "./slot-install-form";
import { SlotAuthOAuth } from "./slot-auth-oauth";
import { SlotAuthToken } from "./slot-auth-token";

interface SlotCardProps {
  slot: ConnectionSlot;
  onComplete: (connectionId: string) => void;
}

export function SlotCard({ slot, onComplete }: SlotCardProps) {
  const resolution = useSlotResolution(slot);
  const [phase, setPhase] = useState<SlotPhase | null>(null);
  const [pollingConnectionId, setPollingConnectionId] = useState<string | null>(
    null,
  );
  const [selectedConnection, setSelectedConnection] =
    useState<ConnectionEntity | null>(null);
  // Tracks which connection needs an auth check after polling times out/errors
  const [authCheckId, setAuthCheckId] = useState<string | null>(null);
  // Prevents onComplete from firing more than once per unique connection
  const completedIdRef = useRef<string | null>(null);

  const poller = useConnectionPoller(pollingConnectionId);

  const authUrl = authCheckId
    ? new URL(`/mcp/${authCheckId}`, window.location.origin).href
    : "";

  const { data: authStatus } = useQuery({
    queryKey: KEYS.isMCPAuthenticated(authUrl, null),
    queryFn: () => isConnectionAuthenticated({ url: authUrl, token: null }),
    enabled: Boolean(authCheckId),
    staleTime: Infinity,
  });

  // Derive effective phase: explicit override takes priority, else from resolution
  const effectivePhase: SlotPhase = phase ?? resolution.initialPhase;

  // React to poller becoming active
  if (pollingConnectionId && poller.isActive && poller.connection) {
    if (completedIdRef.current !== poller.connection.id) {
      completedIdRef.current = poller.connection.id;
      setPollingConnectionId(null);
      setSelectedConnection(poller.connection);
      setPhase("done");
      onComplete(poller.connection.id);
    }
  }

  // React to poller timeout/error — queue an auth check instead of firing async in render
  if (
    pollingConnectionId &&
    (poller.isTimedOut || poller.connection?.status === "error")
  ) {
    if (poller.connection) setSelectedConnection(poller.connection);
    setAuthCheckId(pollingConnectionId);
    setPollingConnectionId(null);
  }

  // React to auth check result — set the appropriate auth phase
  if (
    authCheckId &&
    authStatus &&
    phase !== "auth-oauth" &&
    phase !== "auth-token"
  ) {
    setPhase(authStatus.supportsOAuth ? "auth-oauth" : "auth-token");
  }

  const handleInstalled = (connectionId: string) => {
    setPollingConnectionId(connectionId);
    setPhase("polling");
  };

  const handleAuthed = () => {
    const id =
      pollingConnectionId ?? selectedConnection?.id ?? authCheckId ?? null;
    if (id) {
      setAuthCheckId(null);
      setPollingConnectionId(id);
      setPhase("polling");
    }
  };

  const handleReset = () => {
    const hasExisting = resolution.matchingConnections.length > 0;
    setPhase(hasExisting ? "picker" : "install");
    setSelectedConnection(null);
    setPollingConnectionId(null);
    setAuthCheckId(null);
    completedIdRef.current = null;
    onComplete("");
  };

  const resolvedConnection =
    selectedConnection ?? resolution.satisfiedConnection ?? null;

  // Fallback to authCheckId when connection entity wasn't fetched before timeout
  const authConnectionId = selectedConnection?.id ?? authCheckId;

  if (effectivePhase === "loading") {
    return (
      <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{slot.label}</p>
      </div>
    );
  }

  if (resolution.registryError) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
        <AlertCircle className="size-4 shrink-0 text-destructive" />
        <div>
          <p className="text-sm font-medium">{slot.label}</p>
          <p className="text-xs text-muted-foreground">
            {resolution.registryError}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card px-4 py-4 space-y-3">
      {effectivePhase !== "done" && (
        <p className="text-sm font-medium text-foreground">{slot.label}</p>
      )}

      {effectivePhase === "done" && resolvedConnection && (
        <SlotDone
          label={slot.label}
          connection={resolvedConnection}
          onReset={handleReset}
        />
      )}

      {effectivePhase === "picker" && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Already installed:</p>
          <div className="space-y-1">
            {resolution.matchingConnections.map((conn) => (
              <button
                key={conn.id}
                type="button"
                onClick={() => {
                  if (conn.status === "active") {
                    setSelectedConnection(conn);
                    setPhase("done");
                    onComplete(conn.id);
                  } else {
                    setSelectedConnection(conn);
                    setPollingConnectionId(conn.id);
                    setPhase("polling");
                  }
                }}
                className="w-full flex items-center justify-between rounded border px-3 py-2 text-sm hover:bg-accent transition-colors"
              >
                <span>{conn.title}</span>
                <span className="text-xs text-muted-foreground">
                  {conn.status}
                </span>
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setPhase("install")}
          >
            Install fresh
          </Button>
        </div>
      )}

      {effectivePhase === "install" && resolution.registryItem && (
        <SlotInstallForm
          registryItem={resolution.registryItem}
          onInstalled={handleInstalled}
        />
      )}

      {effectivePhase === "polling" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Connecting...
        </div>
      )}

      {effectivePhase === "auth-oauth" && authConnectionId && (
        <SlotAuthOAuth
          connectionId={authConnectionId}
          providerName={resolution.registryItem?.title ?? slot.label}
          onAuthed={handleAuthed}
        />
      )}

      {effectivePhase === "auth-token" && authConnectionId && (
        <SlotAuthToken
          connectionId={authConnectionId}
          onAuthed={handleAuthed}
        />
      )}
    </div>
  );
}
