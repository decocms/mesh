/**
 * Rich card notification shown via sonner's toast.custom().
 * Appears globally ~5s after navigating into the workspace from onboarding.
 * Shows an illustration, "Your brand context is ready!" message, and a
 * button linking to the Brand Context settings page.
 */

import { useEffect } from "react";
import { toast } from "sonner";
import { useParams } from "@tanstack/react-router";
import { Button } from "@deco/ui/components/button.tsx";
import { ArrowRight, XClose } from "@untitledui/icons";

const TOAST_KEY = "brand-context-toast-shown";
const ONBOARDING_FLAG = "brand-context-onboarding";

/** Call this when the user leaves the onboarding screen via the CTA button. */
export function markOnboardingComplete() {
  sessionStorage.setItem(ONBOARDING_FLAG, "1");
}

/** Returns true if the toast has already fired (i.e. context is "done"). */
export function isBrandContextDone(): boolean {
  return sessionStorage.getItem(TOAST_KEY) === "1";
}

/** Check whether the user just came from onboarding and hasn't seen the toast yet. */
function shouldShowToast(): boolean {
  if (sessionStorage.getItem(TOAST_KEY)) return false;
  if (!sessionStorage.getItem(ONBOARDING_FLAG)) return false;
  return true;
}

// ── Illustration (same network graph, compact) ───────────────────────────────

function MiniIllustration() {
  const c = "var(--color-emerald-500)";
  const nodes = [
    { cx: 50, cy: 16 },
    { cx: 86, cy: 34 },
    { cx: 86, cy: 66 },
    { cx: 50, cy: 84 },
    { cx: 14, cy: 66 },
    { cx: 14, cy: 34 },
  ];

  return (
    <svg viewBox="0 0 100 100" className="w-full h-full" aria-hidden>
      {/* Lines */}
      {nodes.map((n, i) => (
        <line
          key={i}
          x1={n.cx}
          y1={n.cy}
          x2="50"
          y2="50"
          stroke={c}
          strokeOpacity={0.15}
          strokeWidth="0.4"
        />
      ))}
      {nodes.map((n, i) => {
        const next = nodes[(i + 1) % nodes.length]!;
        return (
          <line
            key={`r-${i}`}
            x1={n.cx}
            y1={n.cy}
            x2={next.cx}
            y2={next.cy}
            stroke={c}
            strokeOpacity={0.08}
            strokeWidth="0.3"
          />
        );
      })}
      {/* Center */}
      <circle
        cx="50"
        cy="50"
        r="9"
        fill={c}
        fillOpacity={0.06}
        stroke={c}
        strokeOpacity={0.3}
        strokeWidth="0.5"
      />
      <text
        x="50"
        y="52"
        textAnchor="middle"
        fontSize="6"
        fontWeight="700"
        fill={c}
        fillOpacity={0.5}
      >
        {"{ }"}
      </text>
      {/* Nodes */}
      {nodes.map((n, i) => (
        <circle
          key={`n-${i}`}
          cx={n.cx}
          cy={n.cy}
          r="5"
          fill={c}
          fillOpacity={0.05}
          stroke={c}
          strokeOpacity={0.2}
          strokeWidth="0.4"
        />
      ))}
    </svg>
  );
}

// ── Card content ─────────────────────────────────────────────────────────────

function ContextReadyCard({
  toastId,
  orgSlug,
}: {
  toastId: string | number;
  orgSlug: string;
}) {
  return (
    <div className="w-[320px] rounded-xl border border-border bg-card shadow-lg overflow-hidden animate-in slide-in-from-right-5 fade-in duration-300">
      {/* Illustration area */}
      <div className="relative h-36 bg-success/[0.03] flex items-center justify-center overflow-hidden">
        <div className="w-28 h-28">
          <MiniIllustration />
        </div>
        {/* Dismiss */}
        <button
          type="button"
          onClick={() => toast.dismiss(toastId)}
          className="absolute top-2.5 right-2.5 size-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
          aria-label="Dismiss"
        >
          <XClose size={14} />
        </button>
      </div>

      {/* Content */}
      <div className="px-5 py-4">
        <p className="text-sm font-semibold text-foreground">
          Your brand context is ready!
        </p>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          We've analyzed your website and built a complete profile — brand
          identity, audience, products, market, and SEO.
        </p>
        <Button
          size="sm"
          className="w-full mt-3.5 gap-2"
          onClick={() => {
            toast.dismiss(toastId);
            window.location.href = `/${orgSlug}/settings/brand-context`;
          }}
        >
          Review brand context
          <ArrowRight size={12} />
        </Button>
      </div>
    </div>
  );
}

// ── Hook to trigger the toast ────────────────────────────────────────────────

export function useBrandContextReadyToast() {
  const { org } = useParams({ strict: false }) as { org?: string };

  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    if (!org || !shouldShowToast()) return;

    // Mark as shown before scheduling so concurrent re-renders don't duplicate
    sessionStorage.setItem(TOAST_KEY, "1");
    sessionStorage.removeItem(ONBOARDING_FLAG);

    const timeoutId = setTimeout(() => {
      toast.custom((id) => <ContextReadyCard toastId={id} orgSlug={org} />, {
        duration: 15_000,
        position: "bottom-right",
      });
    }, 10_000);

    return () => clearTimeout(timeoutId);
  }, [org]);
}
