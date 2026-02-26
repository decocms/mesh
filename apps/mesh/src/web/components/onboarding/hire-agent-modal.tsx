/**
 * HireAgentModal
 *
 * Two-column Dialog. Left: agent identity + installs.
 * Right: autonomy selector first, then connections that adapt to the selected mode.
 * — Review/Monitor: no connections required, all optional
 * — Autonomous: publishing connection (GitHub) becomes required before hire
 */

import { useState } from "react";
import { Button } from "@deco/ui/components/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@deco/ui/components/dialog.tsx";
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { AlertCircle, Check, File06, Package } from "@untitledui/icons";

// ─── Types ────────────────────────────────────────────────────────────────────

type AutonomyMode = "review" | "monitor" | "autonomous";

export interface HireAgentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onHire: (mode: AutonomyMode) => void;
}

// ─── Data ──────────────────────────────────────────────────────────────────────

const AUTONOMY_OPTIONS: {
  mode: AutonomyMode;
  label: string;
  description: string;
  recommended?: boolean;
}[] = [
  {
    mode: "review",
    label: "Review",
    description: "Generates drafts. You approve and publish each one.",
    recommended: true,
  },
  {
    mode: "monitor",
    label: "Monitor",
    description: "Suggests topics and improvements. Never publishes.",
  },
  {
    mode: "autonomous",
    label: "Autonomous",
    description:
      "Writes and publishes independently. Requires a publishing connection.",
  },
];

// Connections with metadata about when they're required vs optional
const CONNECTIONS = [
  {
    name: "GitHub",
    description: "Where your posts get published",
    iconUrl: "https://www.google.com/s2/favicons?domain=github.com&sz=32",
    requiredFor: ["autonomous"] as AutonomyMode[],
  },
  {
    name: "Google Search Console",
    description: "Keyword targeting & search data",
    iconUrl:
      "https://www.google.com/s2/favicons?domain=search.google.com&sz=32",
    requiredFor: [] as AutonomyMode[],
  },
  {
    name: "Shopify",
    description: "Product data for richer posts",
    iconUrl: "https://www.google.com/s2/favicons?domain=shopify.com&sz=32",
    requiredFor: [] as AutonomyMode[],
  },
];

// ─── ConnectionRow ────────────────────────────────────────────────────────────

function ConnectionRow({
  conn,
  required,
  connected,
  connecting,
  onConnect,
}: {
  conn: (typeof CONNECTIONS)[number];
  required: boolean;
  connected: boolean;
  connecting: boolean;
  onConnect: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
        required && !connected
          ? "border-amber-300 bg-amber-50/50"
          : "border-border bg-muted/20"
      }`}
    >
      <IntegrationIcon icon={conn.iconUrl} name={conn.name} size="xs" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-foreground leading-tight">
            {conn.name}
          </p>
          {required && !connected && (
            <span className="text-[10px] font-semibold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">
              Required
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground leading-tight mt-0.5">
          {conn.description}
        </p>
      </div>
      {connected ? (
        <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 shrink-0">
          <Check size={12} />
          Connected
        </span>
      ) : (
        <Button
          size="sm"
          variant={required ? "default" : "outline"}
          className="h-7 text-xs shrink-0"
          disabled={connecting}
          onClick={onConnect}
        >
          {connecting ? "Connecting..." : "Connect"}
        </Button>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function HireAgentModal({
  open,
  onOpenChange,
  onHire,
}: HireAgentModalProps) {
  const [connected, setConnected] = useState<Set<string>>(new Set());
  const [connecting, setConnecting] = useState<string | null>(null);
  const [autonomy, setAutonomy] = useState<AutonomyMode>("review");

  function handleConnect(name: string) {
    setConnecting(name);
    setTimeout(() => {
      setConnected((prev) => new Set([...prev, name]));
      setConnecting(null);
    }, 800);
  }

  function handleHire() {
    onHire(autonomy);
    onOpenChange(false);
  }

  // Compute which connections are required for current autonomy mode
  const requiredConnections = CONNECTIONS.filter((c) =>
    c.requiredFor.includes(autonomy),
  );
  const missingRequired = requiredConnections.filter(
    (c) => !connected.has(c.name),
  );
  const canHire = missingRequired.length === 0;

  // Section label changes based on mode
  const connectionsSectionLabel =
    autonomy === "autonomous" ? "Connections" : "Connections";

  const connectionsSectionNote =
    autonomy === "autonomous"
      ? "GitHub is required to publish autonomously."
      : "Optional — connect later to enrich content.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!w-[860px] !max-w-[860px] p-0 gap-0 overflow-hidden">
        <div className="grid grid-cols-[260px_1fr] min-h-[520px]">
          {/* ── Left column ──────────────────────────────────────────── */}
          <div className="flex flex-col gap-5 bg-muted/20 border-r border-border p-6">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-center size-14 rounded-2xl bg-violet-100 text-violet-600">
                <File06 size={26} />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold text-foreground">
                  Blog Post Generator
                </DialogTitle>
                <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">
                  Researches, writes and publishes SEO-optimised blog posts for
                  your store on autopilot.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Installs
              </p>
              <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
                <div className="flex items-center justify-center size-8 rounded-lg bg-violet-100 text-violet-600">
                  <Package size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">Blog</p>
                  <p className="text-xs text-muted-foreground">
                    Sidebar workspace for drafts &amp; queue
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Right column ─────────────────────────────────────────── */}
          <div className="flex flex-col gap-5 p-6">
            {/* Autonomy — first */}
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                How autonomous should it be?
              </p>
              <div className="flex flex-col gap-2">
                {AUTONOMY_OPTIONS.map((opt) => {
                  const isSelected = autonomy === opt.mode;
                  return (
                    <button
                      key={opt.mode}
                      type="button"
                      onClick={() => setAutonomy(opt.mode)}
                      className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                        isSelected
                          ? "border-foreground bg-muted/40"
                          : "border-border bg-transparent hover:bg-muted/20"
                      }`}
                    >
                      <div
                        className={`shrink-0 mt-0.5 size-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                          isSelected
                            ? "border-foreground"
                            : "border-muted-foreground/40"
                        }`}
                      >
                        {isSelected && (
                          <div className="size-2 rounded-full bg-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium text-foreground">
                            {opt.label}
                          </span>
                          {opt.recommended && (
                            <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">
                              Recommended
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                          {opt.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Connections — adapts to autonomy mode */}
            <div className="flex flex-col gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {connectionsSectionLabel}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {connectionsSectionNote}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                {CONNECTIONS.map((conn) => (
                  <ConnectionRow
                    key={conn.name}
                    conn={conn}
                    required={conn.requiredFor.includes(autonomy)}
                    connected={connected.has(conn.name)}
                    connecting={connecting === conn.name}
                    onConnect={() => handleConnect(conn.name)}
                  />
                ))}
              </div>
            </div>

            <div className="flex-1" />

            {/* Blocking message when autonomous + missing required */}
            {!canHire && (
              <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5">
                <AlertCircle
                  size={14}
                  className="text-amber-500 shrink-0 mt-0.5"
                />
                <p className="text-xs text-amber-700 leading-relaxed">
                  Connect GitHub to let this agent publish posts directly.
                </p>
              </div>
            )}

            <Button className="w-full" onClick={handleHire} disabled={!canHire}>
              {canHire
                ? "Hire Blog Post Generator"
                : "Connect GitHub to continue"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
